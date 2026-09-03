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
  DeleteFile: ["project_id", "projectId", "path", "if_match"],
  DeleteFiles: ["project_id", "projectId", "paths", "if_match"],
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

/** Generated request-field decoder for the bounded compatibility messages. */
export function decodeGeneratedRequestFields(body: Uint8Array): Record<string, string> {
  if (body.byteLength > MAX_CONNECT_FRAME_BYTES) throw new Error("Connect message exceeds the frame bound.");
  const result: Record<string, string> = {};
  let offset = 0;
  while (offset < body.length) {
    let key = 0; let shift = 0; let byte = 0;
    do { if (offset >= body.length || shift > 28) throw new Error("Connect message has an invalid field key."); byte = body[offset++]; key += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128);
    const wire = key & 7; const field = key >> 3;
    if (wire === 2) {
      let length = 0; shift = 0;
      do { if (offset >= body.length || shift > 28) throw new Error("Connect message has an invalid field length."); byte = body[offset++]; length += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128);
      if (length > MAX_CONNECT_FRAME_BYTES || length > body.length - offset) throw new Error("Connect field exceeds the frame bound.");
      const value = Buffer.from(body.slice(offset, offset + length)).toString("utf8"); offset += length;
      if (field === 1) result.project_id = value; else if (field === 2) result.path = value; else if (field === 3) result.name = value;
    } else if (wire === 0) {
      do { if (offset >= body.length) throw new Error("Connect varint is truncated."); byte = body[offset++]; } while (byte & 128);
    } else throw new Error("Unsupported generated Connect wire type.");
  }
  return result;
}
