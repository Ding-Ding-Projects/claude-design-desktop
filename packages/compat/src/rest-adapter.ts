import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { DesignDomain, DomainError, DesignProject, RequestContext, normalizeProjectType } from "./domain";
import { normalizeOptionalPath, normalizeProjectPath } from "./path-policy";

export type HttpRequest = {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  remoteAddress?: string;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type RestAdapterOptions = {
  accountId?: string;
  resolveAccount?: (transport: "rest") => Promise<{ accountId: string; authenticated: boolean }>;
  capabilityCheck: (request: HttpRequest) => boolean | Promise<boolean>;
  previewOrigin?: string;
  agents?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
  readSettings?: (accountId: string) => Promise<Record<string, unknown>>;
  updateSettings?: (accountId: string, value: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const REST_FIELDS = new Set(["agent_id", "agentId", "chat_id", "chatId", "content", "content_type", "contentType", "dashboard_html", "dashboardHtml", "data", "deduplicate", "deletePaths", "description", "encoding", "file_path", "filePath", "files", "filter", "if_match", "initial_message", "intro_text", "introText", "kind", "message", "messages", "mime_type", "mimeType", "model", "model_id", "modelId", "name", "path", "paths", "prompt", "project_id", "project_uuid", "projectId", "projectUuid", "render", "text", "title", "type", "validators"]);
function validateRestBody(request: HttpRequest, method: string, path: string): void {
  if (method !== "GET" && method !== "HEAD") {
    const contentType = header(request, "content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) throw new DomainError("This REST route requires application/json.", 415, "unsupported_content_type");
    if (request.body !== undefined && (!request.body || typeof request.body !== "object" || Array.isArray(request.body))) throw new DomainError("The REST request body must be a JSON object.", 400, "invalid_body");
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    for (const key of Object.keys(body)) if (!REST_FIELDS.has(key)) throw new DomainError(`Unsupported REST field: ${key}.`, 400, "unknown_field");
  }
  if (path.includes("/files") && method === "POST" && request.body && typeof request.body === "object") {
    const files = Array.isArray((request.body as any).files) ? (request.body as any).files : [request.body];
    for (const file of files) if (file && typeof file === "object" && !file.if_match && !file.ifMatch) throw new DomainError("if-match is required for every versioned file mutation.", 428, "if_match_required");
  }
}

function header(request: HttpRequest, name: string): string | undefined {
  const value = request.headers?.[name.toLowerCase()] ?? request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}
function json(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8", ...headers }, body };
}

function errorResponse(error: unknown): HttpResponse {
  if (error instanceof DomainError) return json(error.status, { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
  return json(500, { error: { code: "internal_error", message: "The design service could not complete the request." } });
}

function projectPayload(project: DesignProject, includeMessages = false, messages?: unknown[]) {
  return {
    agent_id: "claude-design-desktop",
    can_edit: project.canEdit,
    created_at: project.createdAt,
    dashboard_html: project.dashboardHtml || "",
    description: project.description,
    file_count: project.fileCount,
    id: project.id,
    intro_text: "",
    members: project.members.map((member) => ({ account_uuid: member.accountId, account_id: member.accountId, display_name: member.displayName || "", email: member.email, role: member.role })),
    model: project.model || "",
    name: project.name,
    owner_account_id: project.ownerAccountId,
    owner_display_name: project.ownerAccountId,
    project_id: project.id,
    project_type: project.type === "design-system" ? 3 : project.type === "template" ? 2 : 1,
    sharing: {
      link_permission: project.sharing.linkPermission,
      scope: project.sharing.scope,
      team_can_comment: project.sharing.teamCanComment,
      team_can_edit: project.sharing.teamCanEdit,
      view_mode: project.sharing.viewMode
    },
    title: project.title,
    type: project.type === "design-system" ? 3 : project.type === "template" ? 2 : 1,
    updated_at: project.updatedAt,
    uuid: project.uuid,
    ...(includeMessages ? { chat_id: `${project.id}:default`, messages: messages || [] } : {})
  };
}

function filePayload(file: Awaited<ReturnType<DesignDomain["readFile"]>>) {
  const isBinary = file.content.some((byte) => byte === 0);
  const content = isBinary ? Buffer.from(file.content).toString("base64") : Buffer.from(file.content).toString("utf8");
  const entry = { contentType: file.contentType, name: file.path.split("/").pop() || file.path, path: file.path, size: file.content.byteLength, type: "file", updatedAt: file.updatedAt, version: file.version };
  return { ...entry, content, content_type: file.contentType, encoding: isBinary ? "base64" : "utf8", entry, is_base64: isBinary, project_id: file.projectId };
}

function bodyRecord(request: HttpRequest): Record<string, any> {
  return request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, any> : {};
}

function decodeProjectId(path: string, index: number): string {
  const segment = path.split("/")[index];
  if (!segment) throw new DomainError("project_id is required.", 400, "invalid_project");
  return decodeURIComponent(segment);
}

function decodePathRemainder(path: string, index: number): string {
  return path.split("/").slice(index).map(decodeURIComponent).join("/");
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

export async function handleRestRequest(domain: DesignDomain, request: HttpRequest, options: RestAdapterOptions): Promise<HttpResponse> {
  if (!isLoopbackAddress(request.remoteAddress)) return json(403, { error: { code: "loopback_required", message: "The compatibility HTTP adapter accepts loopback clients only." } });
  if (!(await options.capabilityCheck(request))) return json(401, { error: { code: "capability_required", message: "A valid local capability is required." } });
  const account = options.resolveAccount ? await options.resolveAccount("rest") : { accountId: options.accountId || "", authenticated: Boolean(options.accountId) };
  if (!account.authenticated || !account.accountId) return json(401, { error: { code: "account_required", message: "An authenticated account is required." } });
  const ctx: RequestContext = { accountId: account.accountId, capabilityValid: true, transport: "rest" };
  const method = request.method.toUpperCase();
  const path = request.path.replace(/\?.*$/, "").replace(/\/$/, "") || "/";
  try { validateRestBody(request, method, path); } catch (error) { return errorResponse(error); }
  const body = bodyRecord(request);
  const ifMatch = header(request, "if-match");

  try {
    if (method === "GET" && path === "/v1/design/agents") return json(200, { data: options.agents || [], agents: options.agents || [] });
    if (path === "/v1/design/projects") {
      if (method === "GET") {
        const projects = await domain.listProjects(ctx);
        return json(200, { data: projects.map((project) => projectPayload(project)), has_more: false, next_cursor: null, projects: projects.map((project) => projectPayload(project)) });
      }
      if (method === "POST") {
        const prompt = body.prompt || body.message || body.initial_message;
        const project = await domain.createProject(ctx, { description: body.description, introText: prompt || body.introText || body.intro_text, model: body.model || body.model_id || body.modelId, name: body.name || body.title || "Untitled design", type: normalizeProjectType(body.type ?? body.project_type), dashboardHtml: body.dashboard_html || body.dashboardHtml });
        const withMessages = await domain.getProject(ctx, project.id, true);
        return json(200, { id: project.id, ok: true, project: projectPayload(withMessages, true, withMessages.messages) , project_id: project.id });
      }
      return json(405, { error: { code: "method_not_allowed", message: "The projects route supports GET and POST." } }, { allow: "GET, POST" });
    }

    const projectMatch = path.match(/^\/v1\/design\/projects\/([^/]+)$/);
    if (projectMatch) {
      const projectId = decodeURIComponent(projectMatch[1]);
      if (method === "GET") {
        const project = await domain.getProject(ctx, projectId, true);
        return json(200, { project: projectPayload(project, true, project.messages) });
      }
      if (method === "PATCH" || method === "PUT") {
        const project = await domain.updateProject(ctx, projectId, { description: body.description, model: body.model || body.model_id || body.modelId, name: body.name || body.title, dashboardHtml: body.dashboard_html || body.dashboardHtml });
        return json(200, { ok: true, project: projectPayload(project, true, await domain.listMessages(ctx, projectId)) });
      }
      if (method === "DELETE") {
        await domain.deleteProject(ctx, projectId);
        return json(200, { ok: true, project_id: projectId });
      }
    }

    const messagesMatch = path.match(/^\/v1\/design\/projects\/([^/]+)\/(?:agent\/)?messages$/);
    if (messagesMatch) {
      const projectId = decodeURIComponent(messagesMatch[1]);
      if (method === "GET") return json(200, { messages: await domain.listMessages(ctx, projectId, body.chat_id || body.chatId), project_id: projectId });
      if (method === "POST") {
        const text = body.message || body.prompt || body.content || "";
        const result = await domain.appendMessage(ctx, projectId, String(text), body.chat_id || body.chatId);
        return json(200, { ...result, project_id: projectId });
      }
    }

    const eventsMatch = path.match(/^\/v1\/design\/projects\/([^/]+)\/events$/);
    if (method === "GET" && eventsMatch) return json(200, { data: [], events: [], project_id: decodeURIComponent(eventsMatch[1]), has_more: false });

    if (path === "/v1/design/files") {
      const projectId = String(body.project_id || body.projectId || body.project_uuid || body.projectUuid || "");
      if (!projectId) throw new DomainError("project_id is required.", 400, "invalid_project");
      const requested = [body.path, body.file_path, body.filePath, body.name, ...(Array.isArray(body.paths) ? body.paths : [])].filter((item) => typeof item === "string" && item);
      if (method === "POST") {
        const candidates = [body, ...(Array.isArray(body.files) ? body.files : [])];
        const writes = candidates.filter((item) => item && typeof item === "object").map((item) => {
          const pathValue = item.path || item.file_path || item.filePath || item.filename || item.name;
          const data = item.content ?? item.body ?? item.text ?? item.code ?? item.data ?? "";
          return { path: normalizeProjectPath(pathValue), content: String(item.encoding || "").toLowerCase() === "base64" ? Uint8Array.from(Buffer.from(String(data), "base64")) : Uint8Array.from(Buffer.from(String(data), "utf8")), contentType: item.content_type || item.contentType || item.mime_type || item.mimeType, ifMatch: item.if_match || ifMatch };
        }).filter((item) => item.path);
        const result = await domain.writeFiles(ctx, projectId, writes, Array.isArray(body.deletePaths) ? body.deletePaths.map(normalizeProjectPath) : undefined, body.deduplicate === true);
        const rows = await domain.listFiles(ctx, projectId);
        return json(200, { data: rows.map(filePayload), entries: rows.map(filePayload).map((item) => item.entry), files: rows.map(filePayload), ok: true, project_id: projectId, written: result.files.map(filePayload) });
      }
      const rows = requested.length ? await Promise.all(requested.map((value) => domain.readFile(ctx, projectId, normalizeProjectPath(value)))) : await domain.listFiles(ctx, projectId);
      return json(200, { data: rows.map(filePayload), entries: rows.map(filePayload).map((item) => item.entry), files: rows.map(filePayload), ok: true, project_id: projectId, written: [] });
    }

    const projectFilesMatch = path.match(/^\/v1\/design\/projects\/([^/]+)\/files(?:\/(.*))?$/);
    if (projectFilesMatch && method === "GET") {
      const projectId = decodeURIComponent(projectFilesMatch[1]);
      const filePath = projectFilesMatch[2] ? normalizeProjectPath(decodePathRemainder(path, 6)) : "";
      if (!filePath) {
        const rows = await domain.listFiles(ctx, projectId);
        return json(200, { data: rows.map((row) => filePayload(row)), project_id: projectId });
      }
      return json(200, { ...filePayload(await domain.readFile(ctx, projectId, filePath)), project_id: projectId });
    }

    const serveMatch = path.match(/^\/v1\/design\/projects\/([^/]+)\/serve\/(.*)$/);
    if (serveMatch && (method === "GET" || method === "HEAD")) {
      const projectId = decodeURIComponent(serveMatch[1]);
      const file = await domain.readFile(ctx, projectId, normalizeProjectPath(decodePathRemainder(path, 6)));
      return { status: 200, headers: { "cache-control": "no-store", "content-type": file.contentType, etag: `"${file.version}"` }, body: method === "HEAD" ? undefined : Buffer.from(file.content) };
    }

    if (method === "GET" && (path === "/v1/design/settings" || path === "/v1/design/model-selection")) return options.readSettings ? json(200, await options.readSettings(ctx.accountId)) : json(501, { error: { code: "settings_unavailable", message: "Settings require the product-owned history service." } });
    if (method === "POST" && (path === "/v1/design/settings" || path === "/v1/design/model-selection")) return options.updateSettings ? json(200, { ok: true, ...(await options.updateSettings(ctx.accountId, body)) }) : json(501, { error: { code: "settings_unavailable", message: "Settings require the product-owned history service." } });
    if (method === "POST" && path === "/v1/design/turn-title") return json(200, { kind: body.kind || "chat", ok: true, title: String(body.message || body.title || body.prompt || "").trim().slice(0, 80) || "Untitled design" });
  } catch (error) {
    return errorResponse(error);
  }
  return json(404, { error: { code: "not_found", message: `No design route for ${method} ${path}.` } });
}

async function readBody(request: IncomingMessage, limit = 8 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > limit) throw new DomainError("Request body exceeds the compatibility limit.", 413, "body_too_large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/** Create an explicitly loopback-only HTTP server. The server never logs request bodies or headers. */
export function createLoopbackRestServer(domain: DesignDomain, options: RestAdapterOptions): Server {
  return createServer(async (incoming: IncomingMessage, response: ServerResponse) => {
    try {
      const raw = await readBody(incoming);
      const contentType = String(incoming.headers["content-type"] || "");
      let body: unknown = undefined;
      if (raw.length && contentType.includes("json")) body = JSON.parse(raw.toString("utf8"));
      const headers: Record<string, string | string[] | undefined> = Object.fromEntries(Object.entries(incoming.headers));
      const result = await handleRestRequest(domain, { body, headers, method: incoming.method || "GET", path: incoming.url || "/", remoteAddress: incoming.socket.remoteAddress }, options);
      response.statusCode = result.status;
      for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
      if (Buffer.isBuffer(result.body)) response.end(result.body);
      else if (result.body === undefined) response.end();
      else response.end(JSON.stringify(result.body));
    } catch (error) {
      const result = errorResponse(error);
      response.statusCode = result.status;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify(result.body));
    }
  });
}
