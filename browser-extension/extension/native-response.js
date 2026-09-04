const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_RESPONSE_BYTES = 64 * 1024;
const TYPES = new Set(["proposal-ready", "queued", "download-event", "rejected"]);

export function validateNativeResponse(value) {
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).byteLength > MAX_RESPONSE_BYTES) throw new Error("The native response exceeded its bound");
  if (!value || typeof value !== "object" || Array.isArray(value) || value.protocolVersion !== 1 || !ID.test(value.requestId) || !TYPES.has(value.type)) throw new Error("Invalid native response envelope");
  if (value.type === "proposal-ready") {
    exactKeys(value, ["protocolVersion", "proposalId", "request", "requestId", "type"]);
    if (!ID.test(value.proposalId) || !validRequest(value.request)) throw new Error("Invalid native proposal response");
  } else if (value.type === "rejected") {
    exactKeys(value, ["error", "protocolVersion", "requestId", "type"]);
    if (typeof value.error !== "string" || value.error.length < 1 || value.error.length > 500) throw new Error("Invalid native rejection response");
  } else if (value.type === "queued") {
    exactKeys(value, ["protocolVersion", "record", "requestId", "type"]);
    if (!validRecord(value.record)) throw new Error("Invalid queued response");
  } else {
    exactKeys(value, ["event", "protocolVersion", "record", "requestId", "type"]);
    if (!new Set(["queued", "downloading", "paused", "resumed", "cancelled", "failed", "completed"]).has(value.event) || !validRecord(value.record)) throw new Error("Invalid transfer event response");
  }
  return value;
}

function validRequest(value) {
  return value && typeof value === "object" && typeof value.sourceUrl === "string" && typeof value.filename === "string" && typeof value.destination === "string" && typeof value.sourceLabel === "string";
}
function validRecord(value) { return value && typeof value === "object" && ID.test(value.id) && validRequest(value.request) && Number.isSafeInteger(value.bytesReceived) && Number.isSafeInteger(value.rateBytesPerSecond) && value.progressWindow?.alwaysOnTop === true; }
function exactKeys(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error("Native response contains unknown or missing fields"); }
