import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const text = (file) => readFileSync(resolve(root, file), "utf8");
const inventory = readJson("parity/inventory.json");
const data = readJson("design/reference/screens.json");
const tuples = readJson("parity/tuples.json");
const expected = ["signin:default", "accounts:default", "projects:default", "editor:preview", "sharing:roles", "settings:appearance", "features:overview", "downloads:progress", "recovery:offline"];
const expectedQueryKeys = ["state", "theme", "locale", "width", "height", "scale", "fixture", "time", "motion", "network"];
const evidenceKeys = ["referenceRaw", "referenceReceipt", "applicationRaw", "applicationReceipt", "comparison", "diff"];
const relative = (file) => { if (typeof file !== "string" || file.length === 0 || file.startsWith("/") || file.startsWith("\\") || /^[A-Za-z]:/.test(file)) throw new Error(`path is not repository-relative: ${file}`); return resolve(root, file); };

function routeParts(value, protocol) {
  const url = new URL(value);
  if (url.protocol !== protocol) throw new Error(`route protocol mismatch: ${value}`);
  if (url.pathname !== "" && url.pathname !== "/") throw new Error(`route path mismatch: ${value}`);
  if ([...url.searchParams.keys()].join("|") !== expectedQueryKeys.join("|")) throw new Error(`route query order mismatch: ${value}`);
  return { screen: url.hostname, values: Object.fromEntries(url.searchParams.entries()) };
}

function validate(candidateInventory, candidateData, candidateTuples) {
  if (candidateInventory.version !== 1 || candidateData.version !== 1 || candidateTuples.version !== 1) throw new Error("reference schema version is invalid");
  if (candidateInventory.reference.data !== "design/reference/screens.json" || candidateInventory.reference.renderer !== "design/reference/index.html" || candidateInventory.reference.route !== "design/reference/main.mjs" || candidateInventory.reference.tupleInventory !== "parity/tuples.json") throw new Error("reference source registration is incomplete");
  for (const file of ["design/reference/screens.json", "design/reference/index.html", "design/reference/app.js", "design/reference/main.mjs", "design/reference/route.mjs", "design/reference/protocol-response.mjs", "design/reference/window-state.mjs", "design/reference/preload.cjs", "design/reference/styles.css", "design/reference/launch.mjs", "parity/runtime-route.test.mjs", "parity/protocol-response.test.mjs", "parity/window-state.test.mjs", "parity/negative-probes.mjs"]) if (!existsSync(relative(file))) throw new Error(`implementation file is missing: ${file}`);
  const dataKeys = candidateData.screens.map((item) => `${item.id}:${item.state}`);
  if (dataKeys.length !== expected.length || JSON.stringify([...dataKeys].sort()) !== JSON.stringify([...expected].sort())) throw new Error("screen data does not match the exact expected screen/state inventory");
  if (candidateTuples.screens.length !== expected.length || JSON.stringify([...candidateTuples.screens].sort()) !== JSON.stringify([...expected].sort())) throw new Error("tuple inventory does not cover every screen/state");
  if (!Array.isArray(candidateTuples.variants) || candidateTuples.variants.length !== 48) throw new Error("capture tuple variant inventory is incomplete");
  const variantKeys = new Set();
  for (const variant of candidateTuples.variants) {
    if (!variant.id || !["light", "dark"].includes(variant.theme) || !["en-US", "zh-Hant", "bilingual"].includes(variant.locale) || !Number.isInteger(variant.width) || !Number.isInteger(variant.height) || ![1, 1.25, 1.5, 2].includes(variant.scale)) throw new Error(`invalid capture variant: ${variant.id}`);
    const key = `${variant.theme}:${variant.locale}:${variant.width}x${variant.height}:${variant.scale}`;
    if (variantKeys.has(key)) throw new Error(`duplicate capture variant: ${variant.id}`);
    variantKeys.add(key);
  }
  const requiredVariants = [];
  for (const theme of ["light", "dark"]) for (const locale of ["en-US", "zh-Hant", "bilingual"]) for (const viewport of ["1280x800", "960x700"]) for (const scale of [1, 1.25, 1.5, 2]) requiredVariants.push(`${theme}:${locale}:${viewport}:${scale}`);
  if (requiredVariants.some((key) => !variantKeys.has(key))) throw new Error("normal/minimum viewport, locale, theme, and scale matrix is incomplete");
  if (!String(candidateTuples.evidencePolicy).includes("pending")) throw new Error("evidence policy is not honest about pending captures");
  if (candidateInventory.rows.length !== expected.length) throw new Error("parity inventory row count is incomplete");
  const rowKeys = new Set();
  for (const row of candidateInventory.rows) {
    const key = `${row.screen}:${row.state}`;
    if (rowKeys.has(row.id) || !expected.includes(key)) throw new Error(`duplicate or unexpected parity row: ${row.id}`);
    rowKeys.add(row.id);
    const design = routeParts(row.designRoute, "design-reference:");
    const production = routeParts(row.productionRoute, "claude-design-desktop:");
    if (design.screen !== row.screen || production.screen !== row.screen || JSON.stringify(design.values) !== JSON.stringify(production.values) || design.values.state !== row.state) throw new Error(`design and production tuples differ: ${row.id}`);
    if (row.source !== "design/reference/screens.json" || !existsSync(relative(row.source))) throw new Error(`source registration missing: ${row.id}`);
    if (!row.audit || !existsSync(relative(row.audit))) throw new Error(`audit file missing: ${row.id}`);
    const audit = readJson(row.audit);
    if (audit.version !== 1 || audit.rowId !== row.id || audit.status !== "pending" || !Array.isArray(audit.controls) || audit.controls.length === 0) throw new Error(`audit is not honest and structurally complete: ${row.id}`);
    if (row.auditStatus !== "pending" || row.captureStatus !== "pending" || row.matrixStatus !== "pending") throw new Error(`unverified evidence is incorrectly marked: ${row.id}`);
    if (!row.evidenceTargets || evidenceKeys.some((key) => typeof row.evidenceTargets[key] !== "string" || !row.evidenceTargets[key].startsWith(`parity/evidence/${row.id}/`))) throw new Error(`declared evidence destinations are incomplete: ${row.id}`);
    for (const key of evidenceKeys) if (existsSync(relative(row.evidenceTargets[key]))) throw new Error(`pending evidence unexpectedly exists without a verified receipt: ${row.id}/${key}`);
  }
  const main = text("design/reference/main.mjs");
  const preload = text("design/reference/preload.cjs");
  const renderer = text("design/reference/app.js");
  for (const required of ["protocol.handle(\"design-reference\"", "setWindowOpenHandler", "setPermissionRequestHandler", "will-navigate", "will-redirect", "setZoomFactor", "frame: false", "contextIsolation: true", "sandbox: true", "nodeIntegration: false", "clampWindowBounds", "getNormalBounds", "workArea"]) if (!main.includes(required)) throw new Error(`runtime security or window behavior is missing: ${required}`);
  for (const required of ["ipcRenderer.invoke(\"reference:data\")", "window:state", "contextBridge.exposeInMainWorld"]) if (!preload.includes(required)) throw new Error(`preload contract is missing: ${required}`);
  if (renderer.includes("fetch(")) throw new Error("renderer must not fetch reference data when network is disabled");
  for (const required of ["aria-controls", "role=\"tabpanel\"", "data-action=\"primary\"", "data-action=\"secondary\"", "data-action=\"regex\"", "dblclick", "onState"]) if (!renderer.includes(required)) throw new Error(`renderer interaction contract is missing: ${required}`);
  return true;
}

validate(inventory, data, tuples);
if (process.argv.includes("--negative")) {
  const expectFailure = (label, mutate) => { const copy = structuredClone({ inventory, data, tuples }); mutate(copy); let failed = false; try { validate(copy.inventory, copy.data, copy.tuples); } catch { failed = true; } if (!failed) throw new Error(`negative probe did not turn red: ${label}`); };
  expectFailure("reference removal", (copy) => copy.data.screens.pop());
  expectFailure("route removal", (copy) => copy.inventory.rows.shift());
  expectFailure("tuple field removal", (copy) => delete copy.inventory.rows[0].designRoute);
  expectFailure("audit removal", (copy) => copy.inventory.rows[0].audit = "parity/audits/missing.json");
  expectFailure("comparison destination removal", (copy) => delete copy.inventory.rows[0].evidenceTargets.comparison);
  expectFailure("diff destination removal", (copy) => delete copy.inventory.rows[0].evidenceTargets.diff);
  validate(inventory, data, tuples);
  console.log("PASS: reference, route, tuple, audit, comparison, and diff removals turned red, restored inventory is green");
} else {
  console.log(`PASS: ${inventory.rows.length} honest pending parity rows, ${tuples.variants.length} explicit capture variants, and runtime seam checks are registered`);
}
