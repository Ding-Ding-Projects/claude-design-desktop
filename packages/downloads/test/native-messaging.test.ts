import assert from "node:assert/strict";
import test from "node:test";
import { MAX_NATIVE_MESSAGE_BYTES, encodeNativeEvent, nativeHostManifest, parseNativeMessage } from "../src/native-messaging";

const startMessage = JSON.stringify({
  type: "start-download", protocolVersion: 1, requestId: "request-1",
  request: { sourceUrl: "https://example.test/file.zip", suggestedFilename: "file.zip" }
});

test("native start messages are normalized and strictly parsed", () => {
  const parsed = parseNativeMessage(startMessage);
  assert.equal(parsed.type, "start-download");
  if (parsed.type === "start-download") assert.equal(parsed.request.sourceUrl, "https://example.test/file.zip");
});

test("native protocol rejects unknown fields and malformed input", () => {
  assert.throws(() => parseNativeMessage(startMessage.replace("\"requestId\":\"request-1\"", "\"requestId\":\"request-1\",\"extra\":true")), /unknown or missing/);
  assert.throws(() => parseNativeMessage("not json"), /valid JSON/);
  assert.throws(() => parseNativeMessage(JSON.stringify({ type: "download-control", protocolVersion: 2, requestId: "r", downloadId: "d", action: "cancel" })), /envelope/);
  assert.throws(() => parseNativeMessage("x".repeat(MAX_NATIVE_MESSAGE_BYTES + 1)), /bounded protocol/);
});

test("native progress-window and control messages use bounded ids", () => {
  assert.equal(parseNativeMessage(JSON.stringify({ type: "open-progress-window", protocolVersion: 1, requestId: "r1", downloadId: "d1", title: "file.zip" })).type, "open-progress-window");
  assert.equal(parseNativeMessage(JSON.stringify({ type: "download-control", protocolVersion: 1, requestId: "r1", downloadId: "d1", action: "pause" })).type, "download-control");
  assert.throws(() => parseNativeMessage(JSON.stringify({ type: "download-control", protocolVersion: 1, requestId: "r1", downloadId: "d1", action: "delete" })), /action/);
});

test("host registration template uses an extension id and install placeholder", () => {
  const manifest = nativeHostManifest("abcdefghijklmnopabcdefghijklmnop");
  assert.equal(manifest.type, "stdio");
  assert.deepEqual(manifest.allowed_origins, ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]);
  assert.throws(() => nativeHostManifest("not-an-extension-id"), /extension id/);
  assert.throws(() => nativeHostManifest("abcdefghijklmnopabcdefghijklmnop", "C:\\Users\\someone\\host.exe"), /placeholder/);
});

test("native event encoding has the same exact envelope boundary", () => {
  const record = {
    id: "download-1", request: { sourceUrl: "https://example.test/a", filename: "a", destination: "downloads", sourceLabel: "example" },
    phase: "completed" as const, bytesReceived: 2, rateBytesPerSecond: 1,
    progressWindow: { alwaysOnTop: true as const, accessibleName: "Download progress", windowId: "window-1", visible: false }
  };
  const encoded = encodeNativeEvent({ type: "download-event", protocolVersion: 1, requestId: "r1", event: "completed", record });
  assert.equal(JSON.parse(encoded).event, "completed");
});
