/** Generated from the pinned Omelette service contract at SOURCE_COMMIT. Do not hand-edit method fields. */
export const CONNECT_SCHEMA_VERSION = "claude-design-connect-v1";
export const MAX_CONNECT_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_CONNECT_FRAME_BYTES = 4 * 1024 * 1024;
export const CONNECT_METHOD_SCHEMAS = {
  CreateProject: ["name", "title", "description", "type"],
  GetProject: ["project_id", "projectId"],
  ListFiles: ["project_id", "projectId", "path"],
  GetFile: ["project_id", "projectId", "path"],
  ListProjects: ["type"],
  ListOrgProjects: ["type"],
  WriteFiles: ["project_id", "projectId", "files"],
  DeleteFile: ["project_id", "projectId", "path"],
  DeleteFiles: ["project_id", "projectId", "paths"],
  CopyFile: ["project_id", "projectId", "src", "dest", "src_project_id", "if_match"],
  UpdateSharing: ["project_id", "projectId", "scope", "link_permission"]
} as const;

export function decodeUnaryRequest(body: Uint8Array, maxBytes = MAX_CONNECT_BODY_BYTES): Uint8Array {
  if (body.byteLength > maxBytes || body.byteLength < 5) throw new Error("Connect request exceeds the body or frame bound.");
  const flag = body[0];
  if (flag !== 0) throw new Error("Compressed and end-stream request frames are not accepted for unary RPCs.");
  const length = new DataView(body.buffer, body.byteOffset + 1, 4).getUint32(0, false);
  if (length > MAX_CONNECT_FRAME_BYTES || length !== body.byteLength - 5) throw new Error("Connect request must contain exactly one bounded frame.");
  return body.slice(5);
}

export function encodeUnaryResponse(payload: Uint8Array): Uint8Array {
  if (payload.byteLength > MAX_CONNECT_FRAME_BYTES) throw new Error("Connect response exceeds the frame bound.");
  const output = new Uint8Array(payload.byteLength + 5);
  output[0] = 2;
  new DataView(output.buffer).setUint32(1, payload.byteLength, false);
  output.set(payload, 5);
  return output;
}
