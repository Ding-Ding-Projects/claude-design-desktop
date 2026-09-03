import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const sourceRoot = resolve(import.meta.dirname, "..");
const expected = ["signin:default", "accounts:default", "projects:default", "editor:preview", "sharing:roles", "settings:appearance", "features:overview", "downloads:progress", "recovery:offline"];
const requiredFiles = ["design/reference/screens.json", "design/reference/index.html", "design/reference/app.js", "design/reference/main.mjs", "design/reference/route.mjs", "design/reference/protocol-response.mjs", "design/reference/window-state.mjs", "design/reference/preload.cjs", "design/reference/styles.css", "design/reference/launch.mjs", "parity/inventory.json", "parity/tuples.json"];
const read = (root, path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const copyFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "design-reference-probe-"));
  cpSync(join(sourceRoot, "design"), join(root, "design"), { recursive: true });
  cpSync(join(sourceRoot, "parity"), join(root, "parity"), { recursive: true });
  return root;
};
const check = (root) => {
  for (const path of requiredFiles) if (!existsSync(join(root, path))) throw new Error(`required file missing: ${path}`);
  const data = read(root, "design/reference/screens.json");
  const inventory = read(root, "parity/inventory.json");
  const tuples = read(root, "parity/tuples.json");
  const keys = data.screens.map((item) => `${item.id}:${item.state}`);
  if (JSON.stringify([...keys].sort()) !== JSON.stringify([...expected].sort())) throw new Error("screen registration is incomplete");
  if (inventory.rows.length !== expected.length) throw new Error("parity registration is incomplete");
  if (tuples.screens.length !== expected.length || tuples.variants.length !== 48) throw new Error("tuple test inventory is incomplete");
  for (const item of data.screens) if (!item.en || !item.zh || !item.en.title || !item.zh.title) throw new Error(`localization is incomplete: ${item.id}`);
};
const runProbe = (label, mutate) => {
  const root = copyFixture();
  try {
    check(root);
    mutate(root);
    assert.throws(() => check(root), new RegExp(label, "i"));
    rmSync(root, { recursive: true, force: true });
    const restored = copyFixture();
    try { check(restored); } finally { rmSync(restored, { recursive: true, force: true }); }
  } finally { if (existsSync(root)) rmSync(root, { recursive: true, force: true }); }
};

runProbe("required file missing", (root) => unlinkSync(join(root, "design/reference/screens.json")));
runProbe("parity registration is incomplete", (root) => { const file = join(root, "parity/inventory.json"); const value = read(root, "parity/inventory.json"); value.rows.pop(); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); });
runProbe("localization is incomplete", (root) => { const file = join(root, "design/reference/screens.json"); const value = read(root, "design/reference/screens.json"); delete value.screens[0].zh; writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); });
runProbe("tuple test inventory is incomplete", (root) => { const file = join(root, "parity/tuples.json"); const value = read(root, "parity/tuples.json"); value.variants.pop(); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); });
console.log("PASS: physical reference-file, registration, localization, and tuple-test removals turned red, restored fixtures are green");
