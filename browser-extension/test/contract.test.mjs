import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("MV3 manifest points to a real service worker and popup", async () => {
  const manifest = JSON.parse(await read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "extension/background.js");
  assert.deepEqual(manifest.permissions.sort(), ["contextMenus", "nativeMessaging", "storage"]);
  assert.equal("host_permissions" in manifest, false);
  for (const file of ["extension/background.js", "extension/native-response.js", "extension/popup.html", "extension/popup.js", "extension/options.html", "extension/icon.svg", "native-host/windows/register-user.ps1.template"]) {
    await stat(path.join(root, file));
  }
});

test("extension hands off to the installed product and never owns transfer", async () => {
  const source = await read("extension/background.js");
  assert.doesNotMatch(source, /chrome\.downloads\./u);
  assert.doesNotMatch(source, /chrome\.windows\./u);
  assert.doesNotMatch(source, /chrome\.notifications\./u);
  assert.match(source, /sendNative\(/u);
  assert.match(source, /propose-download/u);
  assert.match(source, /cancel-proposal/u);
  assert.match(source, /queueChanged: false/u);
});

test("browser input stays bounded and rejects embedded URL credentials", async () => {
  const source = await read("extension/background.js");
  assert.match(source, /maxUrl: 2048/u);
  assert.match(source, /parsed\.username \|\| parsed\.password/u);
  assert.match(source, /isPrivateOrLocalHost/u);
  assert.match(source, /validateNativeResponse/u);
  assert.match(source, /maxFilename: 240/u);
  assert.match(await read("extension/popup.html"), /type=["']url["'] required maxlength=["']2048["']/u);
});

test("browser response validator rejects incomplete and accepts exact host events", async () => {
  const { validateNativeResponse } = await import("../extension/native-response.js");
  const record = { id: "download-1", request: { sourceUrl: "https://example.test/a", filename: "a", destination: "downloads", sourceLabel: "example" }, bytesReceived: 0, rateBytesPerSecond: 0, phase: "queued", progressWindow: { alwaysOnTop: true } };
  assert.equal(validateNativeResponse({ type: "queued", protocolVersion: 1, requestId: "r1", record }).type, "queued");
  assert.throws(() => validateNativeResponse({ type: "queued", protocolVersion: 1, requestId: "r1", record, extra: true }), /unknown or missing/);
});

test("native templates stay machine-neutral and protocol schema is strict", async () => {
  const template = await read("native-host/windows/com.claude.design.downloads.json.template");
  const schema = JSON.parse(await read("native-host/protocol.schema.json"));
  assert.match(template, /\{\{INSTALL_DIR\}\}/u);
  assert.match(template, /\{\{EXTENSION_ID\}\}/u);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.protocolVersion.const, 1);
  assert.equal(schema.properties.type.enum.includes("download-event"), true);
  assert.equal(schema.properties.type.enum.includes("proposal-ready"), true);
});

test("the installed product path uses a current-user named pipe, not child-process messaging", async () => {
  const main = await readFile(path.join(root, "..", "packages", "downloads", "src", "windows-native-host-main.ts"), "utf8");
  const bridge = await readFile(path.join(root, "..", "packages", "downloads", "src", "product-named-pipe-bridge.ts"), "utf8");
  const listener = await readFile(path.join(root, "..", "packages", "downloads", "src", "product-main-download-listener.ts"), "utf8");
  assert.doesNotMatch(main, /process\.send/u);
  assert.doesNotMatch(main, /createServer|\.listen\(/u);
  assert.match(main, /readProtectedProductPipeDescriptor/u);
  assert.match(bridge, /current-user/u);
  assert.doesNotMatch(bridge, /createServer|\.listen\(/u);
  assert.match(bridge, /encodeNativeFrame/u);
  assert.match(listener, /createServer/u);
  assert.match(listener, /verifyCurrentUserAcl/u);
  assert.match(listener, /readVaultCapability/u);
});
