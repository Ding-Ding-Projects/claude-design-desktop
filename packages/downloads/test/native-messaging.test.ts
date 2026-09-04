import assert from "node:assert/strict";
import test from "node:test";
import { encodeNativeFrame, NativeFrameDecoder } from "../src/native-messaging-codec.js";
import { nativeHostManifest, parseNativeMessage, validateNativeHostResponse } from "../src/native-messaging.js";
import { equalMac, proofMac, requestDigest } from "../src/pipe-auth.js";

test("native messaging uses a four-byte little-endian frame", () => {
  const frame = encodeNativeFrame(JSON.stringify({ type: "confirm-download", protocolVersion: 1, requestId: "r1", proposalId: "p1", confirmation: { keyOne: true, keyTwo: true, slider: 1 } }));
  assert.equal(new DataView(frame.buffer).getUint32(0, true), frame.length - 4);
  const decoder = new NativeFrameDecoder();
  assert.deepEqual(decoder.push(frame.slice(0, 2)), []);
  assert.deepEqual(decoder.push(frame.slice(2)), ['{"type":"confirm-download","protocolVersion":1,"requestId":"r1","proposalId":"p1","confirmation":{"keyOne":true,"keyTwo":true,"slider":1}}']);
  decoder.assertComplete();
});

test("native framing supports multiple messages and rejects incomplete or oversized frames", () => {
  const first = encodeNativeFrame("{}");
  const second = encodeNativeFrame("{\"ok\":true}");
  const decoder = new NativeFrameDecoder();
  assert.deepEqual(decoder.push(new Uint8Array([...first, ...second])), ["{}", "{\"ok\":true}"]);
  const incomplete = new NativeFrameDecoder();
  incomplete.push(first.slice(0, 3));
  assert.throws(() => incomplete.assertComplete(), /incomplete frame/);
  const oversized = new Uint8Array(4); new DataView(oversized.buffer).setUint32(0, 65 * 1024, true);
  assert.throws(() => new NativeFrameDecoder().push(oversized), /bounded frame/);
});

test("proposal, confirmation, and control messages are strict", () => {
  const proposal = parseNativeMessage(JSON.stringify({ type: "propose-download", protocolVersion: 1, requestId: "r1", request: { sourceUrl: "https://example.test/file.zip", suggestedFilename: "file.zip" } }));
  assert.equal(proposal.type, "propose-download");
  assert.equal(parseNativeMessage(JSON.stringify({ type: "confirm-download", protocolVersion: 1, requestId: "r1", proposalId: "p1", confirmation: { keyOne: true, keyTwo: true, slider: 1 } })).type, "confirm-download");
  assert.equal(parseNativeMessage(JSON.stringify({ type: "download-control", protocolVersion: 1, requestId: "r1", downloadId: "d1", action: "pause" })).type, "download-control");
  assert.throws(() => parseNativeMessage(JSON.stringify({ type: "confirm-download", protocolVersion: 1, requestId: "r1", proposalId: "p1", extra: true })), /unknown or missing/);
  assert.throws(() => parseNativeMessage(JSON.stringify({ type: "download-control", protocolVersion: 1, requestId: "r1", downloadId: "d1", action: "delete" })), /action/);
});

test("host responses use exact event envelopes", () => {
  const record = { id: "download-1", request: { sourceUrl: "https://example.test/a", filename: "a", destination: "downloads", sourceLabel: "example" }, phase: "completed" as const, bytesReceived: 2, rateBytesPerSecond: 1, progressWindow: { alwaysOnTop: true as const, accessibleName: "Download progress", windowId: "window-1", visible: false } };
  const response = validateNativeHostResponse({ type: "download-event", protocolVersion: 1, requestId: "r1", event: "completed", record });
  assert.equal(response.type, "download-event");
  assert.throws(() => validateNativeHostResponse({ type: "download-event", protocolVersion: 1, requestId: "r1", event: "completed", record, extra: true } as any), /unknown or missing/);
});

test("host registration uses owner-selected extension id and a Windows placeholder", () => {
  const manifest = nativeHostManifest("abcdefghijklmnopabcdefghijklmnop");
  assert.equal(manifest.type, "stdio");
  assert.deepEqual(manifest.allowed_origins, ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]);
  assert.throws(() => nativeHostManifest("not-an-extension-id"), /extension id/);
  assert.throws(() => nativeHostManifest("abcdefghijklmnopabcdefghijklmnop", "C:\\Users\\someone\\host.exe"), /machine-neutral/);
});

test("nonce proof binds the request digest, role, and protocol version", () => {
  const digest = requestDigest("payload");
  const mac = proofMac("vault-capability", "nonce-1", "native-host-client", 1, digest);
  assert.equal(equalMac(mac, proofMac("vault-capability", "nonce-1", "native-host-client", 1, digest)), true);
  assert.equal(equalMac(mac, proofMac("vault-capability", "nonce-2", "native-host-client", 1, digest)), false);
  assert.equal(equalMac(mac, proofMac("vault-capability", "nonce-1", "product-main", 1, digest)), false);
});
