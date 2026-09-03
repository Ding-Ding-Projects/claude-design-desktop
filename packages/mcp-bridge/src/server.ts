import { createInterface } from "node:readline";
import { createServer as createNetServer } from "node:net";
import { DesignDomain, DomainError, RequestContext } from "../../compat/src/domain";
import { MCP_PROTOCOL_VERSION, McpToolName, MCP_TOOL_NAMES } from "../../compat/src/manifest";
import { normalizeProjectPath } from "../../compat/src/path-policy";
import { PlanTokenManager } from "../../compat/src/plan-tokens";
import { MCP_TOOL_DEFINITIONS, validateMcpInput } from "./tools";
export type McpBridgeOptions = { accountId?: string; previewOrigin: string; planTokens?: PlanTokenManager; maxLineBytes?: number; pipeCapabilityCheck?: (value: string) => boolean | Promise<boolean>; resolveAccount?: (transport: "mcp") => Promise<{ accountId: string; authenticated: boolean }> };
export type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };
export type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
const rec = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const res = (id: any, result: unknown): JsonRpcResponse => ({ id: id ?? null, jsonrpc: "2.0", result });
const err = (id: any, code: number, message: string): JsonRpcResponse => ({ error: { code, message }, id: id ?? null, jsonrpc: "2.0" });
const text = (v: unknown, isError = false) => ({ ...(isError ? { isError: true } : {}), content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const proj = (p: any) => ({ id: p.id, uuid: p.uuid, project_id: p.id, name: p.name, title: p.title, description: p.description, project_type: p.type === "design-system" ? 3 : p.type === "template" ? 2 : 1, owner_account_id: p.ownerAccountId, created_at: p.createdAt, updated_at: p.updatedAt, can_edit: p.canEdit, file_count: p.fileCount, sharing: { link_permission: p.sharing.linkPermission, scope: p.sharing.scope, team_can_comment: p.sharing.teamCanComment, team_can_edit: p.sharing.teamCanEdit, view_mode: p.sharing.viewMode } });
const fil = (f: any) => ({ path: f.path, name: f.path.split("/").pop() || f.path, content: Buffer.from(f.content).toString(f.content.some((x: number) => x === 0) ? "base64" : "utf8"), content_type: f.contentType, encoding: f.content.some((x: number) => x === 0) ? "base64" : "utf8", is_base64: f.content.some((x: number) => x === 0), project_id: f.projectId, size: f.content.byteLength, version: f.version, updated_at: f.updatedAt });
const bytes = (f: any) => Uint8Array.from(Buffer.from(String(f.data ?? f.content ?? ""), f.encoding === "base64" || f.is_base64 === true ? "base64" : "utf8"));
export class McpBridge {
  private initialized = false;
  private ready = false;
  private readonly plans: PlanTokenManager;
  private readonly ctx: RequestContext;
  constructor(private readonly domain: DesignDomain, private readonly options: McpBridgeOptions) { this.plans = options.planTokens || new PlanTokenManager(); this.ctx = { accountId: options.accountId || "", capabilityValid: true, transport: "mcp" }; }
  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return err(request.id, -32600, "Invalid JSON-RPC 2.0 request.");
    try { if (request.method === "initialize") { if (this.initialized) return err(request.id, -32600, "initialize may only be called once."); this.initialized = true; return res(request.id, { capabilities: { tools: {} }, protocolVersion: MCP_PROTOCOL_VERSION, serverInfo: { name: "claude-design-desktop", version: "1.0.0" } }); } if (request.method === "notifications/initialized") { if (!this.initialized) return err(request.id, -32001, "Initialize the MCP bridge before notifications/initialized."); this.ready = true; return res(request.id, {}); } if (!this.initialized || !this.ready) return err(request.id, -32001, "Complete initialize and notifications/initialized before another method."); if (this.options.resolveAccount) { const account = await this.options.resolveAccount("mcp"); if (!account.authenticated || !account.accountId) throw new DomainError("An authenticated account is required.", 401, "account_required"); this.ctx.accountId = account.accountId; } else if (!this.ctx.accountId) throw new DomainError("An account resolver is required.", 401, "account_required"); if (request.method === "tools/list") return res(request.id, { tools: MCP_TOOL_DEFINITIONS }); if (request.method !== "tools/call") return err(request.id, -32601, `Unsupported MCP method: ${request.method}`); const p = rec(request.params); const name = p.name as string; if (!(MCP_TOOL_NAMES as readonly string[]).includes(name)) return res(request.id, text(`Unknown MCP operation "${name}".`, true)); const args = rec(p.arguments); validateMcpInput(name as McpToolName, args); return res(request.id, await this.call(name as McpToolName, args)); } catch (e) { return res(request.id, text(e instanceof Error ? e.message : String(e), true)); }
  }
  private async call(name: McpToolName, a: Record<string, any>): Promise<unknown> {
    const id = () => { const value = a.project_id || a.projectId; if (typeof value !== "string" || !value) throw new DomainError("project_id is required.", 400, "invalid_project"); return value; };
    switch (name) {
      case "list_design_systems": return text((await this.domain.listDesignSystems(this.ctx)).map(proj));
      case "get_claude_design_prompt": return text("Use the product-owned project workspace. Call finalize_plan before copy_files or delete_files.");
      case "list_projects": return text((await this.domain.listProjects(this.ctx)).map(proj));
      case "get_project": return text(proj(await this.domain.getProject(this.ctx, id(), true)));
      case "list_files": return text((await this.domain.listFiles(this.ctx, id(), a.path ? normalizeProjectPath(a.path) : "")).map(fil));
      case "read_file": return text(fil(await this.domain.readFile(this.ctx, id(), normalizeProjectPath(a.path))));
      case "get_conversation": return text({ chat_id: a.chat_id || `${id()}:default`, messages: await this.domain.listMessages(this.ctx, id(), a.chat_id), project_id: id() });
      case "list_members": return text(await this.domain.listMembers(this.ctx, id()));
      case "create_project": return text(proj(await this.domain.createProject(this.ctx, { name: a.name, description: a.description, type: a.type })));
      case "put_conversation": return text({ chat_id: `${id()}:default`, messages: await this.domain.putMessages(this.ctx, id(), Array.isArray(a.messages) ? a.messages : [], a.title), project_id: id() });
      case "finalize_plan": return text({ ...this.plans.issue(id(), a.scope === "project" ? "project" : "paths", a.writes || [], a.deletes || [], a.operation_id), project_id: id() });
      case "write_files": { const files = (Array.isArray(a.files) ? a.files : []).map((f: any) => ({ path: normalizeProjectPath(f.path), content: bytes(f), contentType: f.content_type || f.contentType, ifMatch: f.if_match })); if (files.some((f: any) => !f.ifMatch)) throw new DomainError("if-match is required for every versioned file mutation.", 428, "if_match_required"); const r = await this.domain.writeFiles(this.ctx, id(), files); return text({ data: r.files.map(fil), files: r.files.map(fil), project_id: id() }); }
      case "copy_files": { const fs = (a.files || []).map((f: any) => ({ src: normalizeProjectPath(f.src), dest: normalizeProjectPath(f.dest), srcProjectId: f.src_project_id, ifMatch: f.if_match })); this.plans.validate(a.plan_token, id(), fs.map((f: any) => f.dest), "writes", a.operation_id); return text(await this.domain.copyFiles(this.ctx, id(), fs)); }
      case "delete_files": { const ps = [...(a.paths || []), ...(a.files || []).map((f: any) => f.path)].map(normalizeProjectPath); this.plans.validate(a.plan_token, id(), ps, "deletes", a.operation_id); return text(await this.domain.deleteFiles(this.ctx, id(), ps)); }
      case "render_preview": return text(await this.domain.renderPreview(this.ctx, id(), a.path ? normalizeProjectPath(a.path) : undefined, a.render, a.validators || []));
      case "create_support_js": return text(fil(await this.domain.createSupportJs(this.ctx, id(), a.path, a.if_match)));
      case "add_member": return text(await this.domain.addMember(this.ctx, id(), { accountId: a.account_uuid || a.accountId, email: a.email || "", role: a.role }));
      case "update_member_role": return text(await this.domain.updateMemberRole(this.ctx, id(), a.account_uuid || a.accountId, a.role));
      case "remove_member": return text({ project_id: id(), removed: await this.domain.removeMember(this.ctx, id(), a.account_uuid || a.accountId) });
      case "update_sharing": return text({ project_id: id(), sharing: await this.domain.updateSharing(this.ctx, id(), { scope: a.scope, linkPermission: a.link_permission }) });
    }
  }
  async serveStdio(input = process.stdin, output = process.stdout) { const lines = createInterface({ input, crlfDelay: Infinity }); for await (const line of lines) { if (Buffer.byteLength(line, "utf8") > (this.options.maxLineBytes || 8 * 1024 * 1024)) { output.write(`${JSON.stringify(err(null, -32600, "MCP request exceeds the line-size limit."))}\n`); continue; } let req: JsonRpcRequest; try { req = JSON.parse(line); } catch { output.write(`${JSON.stringify(err(null, -32700, "Invalid JSON."))}\n`); continue; } output.write(`${JSON.stringify(await this.handle(req))}\n`); } }
  listenPipe(path: string, onError?: (error: Error) => void) { if (!path) throw new DomainError("A pipe path is required.", 400, "invalid_pipe"); const server = createNetServer((socket) => { let buffer = ""; let authenticated = false; let processing = Promise.resolve(); socket.setEncoding("utf8"); socket.on("data", (chunk) => { buffer += chunk; if (Buffer.byteLength(buffer, "utf8") > 65536) { socket.destroy(); return; } let i = buffer.indexOf("\n"); while (i >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); i = buffer.indexOf("\n"); if (Buffer.byteLength(line, "utf8") > 65536) { socket.destroy(); return; } processing = processing.then(async (): Promise<void> => { let request: JsonRpcRequest; try { request = JSON.parse(line); } catch { socket.destroy(); return; } if (!authenticated) { if (request.method !== "handshake" || typeof request.params?.capability !== "string" || !this.options.pipeCapabilityCheck || !(await this.options.pipeCapabilityCheck(request.params.capability))) { socket.destroy(); return; } authenticated = true; socket.write(`${JSON.stringify(res(request.id, { authenticated: true }))}\n`); return; } socket.write(`${JSON.stringify(await this.handle(request))}\n`); }).catch(() => { socket.destroy(); }); } }); }); if (onError) server.on("error", onError); server.listen(path); return server; }
}
