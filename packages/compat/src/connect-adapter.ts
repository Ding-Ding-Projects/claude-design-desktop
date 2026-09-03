import { DesignDomain, DomainError, RequestContext, normalizeLinkPermission, normalizeProjectType, normalizeSharingScope } from "./domain";
import { handleJsonSyncRequest } from "./json-sync-adapter";
import { normalizeProjectPath } from "./path-policy";
import { decodeUnaryRequest, encodeUnaryResponse } from "./generated/connect";

export const CONNECT_PREFIX = "/design/anthropic.omelette.api.v1alpha.OmeletteService/";
export type ConnectRequest = { method: string; path: string; contentType: string; body: Uint8Array | string | Record<string, unknown> };
export type ConnectResponse = { status: number; contentType: string; body: Uint8Array | Record<string, unknown> };
export type ConnectOptions = { accountId?: string; resolveAccount?: (transport: "connect") => Promise<{ accountId: string; authenticated: boolean }> };

const join = (...xs: Uint8Array[]) => Uint8Array.from(xs.flatMap((x) => [...x]));
const varint = (n: number) => { const a: number[] = []; do { a.push((n & 127) | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); return Uint8Array.from(a); };
const field = (num: number, data: Uint8Array) => join(varint(num * 8 + 2), varint(data.length), data);
const str = (num: number, value: string) => field(num, Uint8Array.from(Buffer.from(value)));
const integer = (num: number, value: number) => join(varint(num * 8), varint(value));

export function encodeConnectFrame(payload: Uint8Array, endStream = false) { if (endStream) return encodeUnaryResponse(payload); const h = new Uint8Array(5); h[0] = 0; new DataView(h.buffer).setUint32(1, payload.length); return join(h, payload); }
export function decodeConnectFrames(body: Uint8Array) { const out: Uint8Array[] = []; let offset = 0; while (offset + 5 <= body.length) { const length = new DataView(body.buffer, body.byteOffset + offset + 1, 4).getUint32(0); offset += 5; if (length > body.length - offset) throw new DomainError("Connect frame is truncated.", 400, "invalid_connect_frame"); out.push(body.slice(offset, offset + length)); offset += length; } if (offset !== body.length) throw new DomainError("Connect frame has trailing bytes.", 400, "invalid_connect_frame"); return out; }
function protoRecord(body: Uint8Array): Record<string, string> { const out: Record<string, string> = {}; let offset = 0; while (offset < body.length) { let key = 0; let shift = 0; let byte = 0; do { byte = body[offset++]; key += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128); const wire = key & 7; const number = key >> 3; if (wire === 2) { let length = 0; shift = 0; do { byte = body[offset++]; length += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128); const value = body.slice(offset, offset + length); offset += length; const valueText = Buffer.from(value).toString(); if (number === 1) out.project_id = valueText; if (number === 2) out.path = valueText; if (number === 3) out.name = valueText; } else if (wire === 0) { do { byte = body[offset++]; } while (byte & 128); } else throw new DomainError("Unsupported protobuf wire type.", 400, "unsupported_connect_wire_type"); } return out; }
function bodyRecord(request: ConnectRequest): Record<string, any> { if (request.contentType.includes("connect+proto")) return protoRecord(decodeUnaryRequest(request.body instanceof Uint8Array ? request.body : Uint8Array.from(Buffer.from(String(request.body), "binary")))); if (typeof request.body === "string") { try { return JSON.parse(request.body); } catch { return {}; } } return request.body instanceof Uint8Array ? {} : request.body as Record<string, any>; }
const projectBytes = (p: any) => join(str(1, p.id), str(2, p.name), str(3, p.description), integer(4, p.type === "design-system" ? 3 : p.type === "template" ? 2 : 1), integer(5, p.fileCount));
const fileBytes = (f: any) => join(str(1, f.path), field(2, f.content), str(3, f.contentType), integer(4, f.version));

export async function handleConnectRequest(domain: DesignDomain, request: ConnectRequest, options: ConnectOptions): Promise<ConnectResponse> {
  if (request.method.toUpperCase() !== "POST") return { status: 405, contentType: "application/json; charset=utf-8", body: { error: { message: "Connect RPC only supports POST." } } };
  if (!request.path.startsWith(CONNECT_PREFIX)) return { status: 404, contentType: "application/json; charset=utf-8", body: { error: { message: "Unknown Connect route." } } };
  const name = request.path.slice(CONNECT_PREFIX.length).replace(/\?.*$/, "");
  const body = bodyRecord(request);
  const account = options.resolveAccount ? await options.resolveAccount("connect") : { accountId: options.accountId || "", authenticated: Boolean(options.accountId) };
  if (!account.authenticated || !account.accountId) return { status: 401, contentType: "application/json; charset=utf-8", body: { error: { code: "account_required", message: "An authenticated account is required." } } };
  const context: RequestContext = { accountId: account.accountId, capabilityValid: true, transport: "connect" };
  try {
    if (request.contentType.includes("application/json")) { const response = await handleJsonSyncRequest(domain, { method: "POST", path: `/v1/design/anthropic.omelette.api.v1alpha.OmeletteService/${name}`, body }, { accountId: account.accountId }); return { status: response.status, contentType: "application/json; charset=utf-8", body: response.body as Record<string, unknown> }; }
    const frame = (payload: Uint8Array): ConnectResponse => ({ status: 200, contentType: "application/connect+proto", body: encodeConnectFrame(payload, true) });
    switch (name) {
      case "CreateProject": return frame(projectBytes(await domain.createProject(context, { name: body.name || body.title || "Untitled design", description: body.description, type: normalizeProjectType(body.type ?? body.project_type) })));
      case "GetProject": return frame(projectBytes(await domain.getProject(context, body.project_id || body.projectId)));
      case "ListFiles": return frame(join(...(await domain.listFiles(context, body.project_id || body.projectId, body.path ? normalizeProjectPath(body.path) : "")).map(fileBytes)));
      case "GetFile": return frame(fileBytes(await domain.readFile(context, body.project_id || body.projectId, normalizeProjectPath(body.path))));
      case "ListProjects":
      case "ListOrgProjects": return frame(join(...(await domain.listProjects(context, normalizeProjectType(body.type))).map(projectBytes)));
      case "WriteFiles": { const r = await domain.writeFiles(context, body.project_id || body.projectId, (Array.isArray(body.files) ? body.files : []).map((f: any) => ({ path: normalizeProjectPath(f.path || f.name), content: Uint8Array.from(Buffer.from(String(f.contentBase64 || f.content || ""), f.contentBase64 ? "base64" : "utf8")), contentType: f.contentType || f.content_type, ifMatch: f.if_match }))); return frame(join(...r.files.map(fileBytes))); }
      case "DeleteFile":
      case "DeleteFiles": { const paths = (Array.isArray(body.paths) ? body.paths : [body.path]).filter(Boolean).map(normalizeProjectPath); return frame(integer(1, (await domain.deleteFiles(context, body.project_id || body.projectId, paths)).deleted)); }
      case "CopyFile": { const r = await domain.copyFiles(context, body.project_id || body.projectId, [{ src: normalizeProjectPath(body.src), dest: normalizeProjectPath(body.dest), srcProjectId: body.src_project_id, ifMatch: body.if_match }]); return frame(join(...r.files.map(fileBytes))); }
      case "UpdateSharing": { const sharing = await domain.updateSharing(context, body.project_id || body.projectId, { scope: normalizeSharingScope(body.scope), linkPermission: normalizeLinkPermission(body.link_permission) }); return frame(join(str(1, sharing.scope), str(2, sharing.linkPermission))); }
      default: return { status: 501, contentType: "application/json; charset=utf-8", body: { error: { message: `Connect RPC ${name || "unknown"} is not supported.` } } };
    }
  } catch (error) { if (error instanceof DomainError) return { status: error.status, contentType: "application/json; charset=utf-8", body: { error: { code: error.code, message: error.message } } }; return { status: 400, contentType: "application/json; charset=utf-8", body: { error: { message: error instanceof Error ? error.message : String(error) } } }; }
}
