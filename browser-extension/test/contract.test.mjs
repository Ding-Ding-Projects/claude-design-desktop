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
  for (const file of ["extension/background.js", "extension/popup.html", "extension/popup.js", "extension/progress.html", "extension/progress.js", "extension/options.html", "extension/icon.svg"]) {
    await stat(path.join(root, file));
  }
});

test("extension has a real browser download and distinct progress surface", async () => {
  const source = await read("extension/background.js");
  assert.match(source, /chrome\.downloads\.download\(/u);
  assert.match(source, /chrome\.windows\.create\(/u);
  assert.match(source, /alwaysOnTop: true/u);
  assert.match(source, /cancel-proposal/u);
  assert.match(source, /queueChanged: false/u);
});

test("browser input stays bounded and rejects embedded URL credentials", async () => {
  const source = await read("extension/background.js");
  assert.match(source, /maxUrl: 2048/u);
  assert.match(source, /parsed\.username \|\| parsed\.password/u);
  assert.match(source, /maxFilename: 240/u);
  assert.match(await read("extension/popup.html"), /type=["']url["'] required maxlength=["']2048["']/u);
});

test("native templates stay machine-neutral and protocol schema is strict", async () => {
  const template = await read("native-host/com.claude.design.downloads.json.template");
  const schema = JSON.parse(await read("native-host/protocol.schema.json"));
  assert.match(template, /\{\{INSTALL_DIR\}\}/u);
  assert.match(template, /\{\{EXTENSION_ID\}\}/u);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.protocolVersion.const, 1);
});
