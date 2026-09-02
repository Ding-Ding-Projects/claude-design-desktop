import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const inventory = readJson("parity/inventory.json");
const data = readJson("design/reference/screens.json");
const expected = new Set(["signin:default", "accounts:default", "projects:default", "editor:preview", "sharing:roles", "settings:appearance", "features:overview", "downloads:progress", "recovery:offline"]);

function validate(candidateInventory, candidateData) {
  if (candidateInventory.version !== 1 || candidateData.version !== 1) throw new Error("reference schema version is invalid");
  if (candidateInventory.reference.data !== "design/reference/screens.json") throw new Error("reference data source changed");
  if (candidateInventory.reference.renderer !== "design/reference/index.html") throw new Error("reference renderer changed");
  if (candidateInventory.reference.route !== "design/reference/main.mjs") throw new Error("reference route changed");
  const dataKeys = new Set(candidateData.screens.map((item) => `${item.id}:${item.state}`));
  if (dataKeys.size !== expected.size || [...expected].some((key) => !dataKeys.has(key))) throw new Error("hand-written screen data inventory is incomplete");
  if (candidateInventory.rows.length !== expected.size) throw new Error("hand-written parity inventory is incomplete");
  const rowIds = new Set();
  for (const row of candidateInventory.rows) {
    if (rowIds.has(row.id) || !rowIds.add(row.id)) throw new Error(`duplicate row: ${row.id}`);
    if (!expected.has(`${row.screen}:${row.state}`)) throw new Error(`unexpected route: ${row.id}`);
    if (!row.designRoute.startsWith("design-reference://") || !row.productionRoute.startsWith("claude-design-desktop://")) throw new Error(`route protocol missing: ${row.id}`);
    const designUrl = new URL(row.designRoute);
    if (designUrl.hostname !== row.screen || designUrl.searchParams.get("state") !== row.state || designUrl.searchParams.get("theme") !== "light" || designUrl.searchParams.get("locale") !== "en-US") throw new Error(`design tuple mismatch: ${row.id}`);
    for (const key of ["state", "theme", "locale", "width", "height", "scale", "fixture", "time", "motion", "network"]) if (!designUrl.searchParams.has(key)) throw new Error(`route tuple missing ${key}: ${row.id}`);
    if (row.source !== "design/reference/screens.json" || !row.audit.startsWith("parity/audits/") || !row.evidence.startsWith("parity/evidence/")) throw new Error(`evidence destinations missing: ${row.id}`);
  }
  return true;
}

validate(inventory, data);
if (process.argv.includes("--negative")) {
  const withoutRow = structuredClone(inventory); withoutRow.rows.pop();
  let rowFailed = false; try { validate(withoutRow, data); } catch { rowFailed = true; }
  if (!rowFailed) throw new Error("negative row removal did not turn red");
  const withoutRouteField = structuredClone(inventory); withoutRouteField.rows[0].designRoute = withoutRouteField.rows[0].designRoute.replace("&network=disabled", "");
  let routeFailed = false; try { validate(withoutRouteField, data); } catch { routeFailed = true; }
  if (!routeFailed) throw new Error("negative route removal did not turn red");
  validate(inventory, data);
  console.log("PASS: deliberate row and route removals turned red, restored inventory is green");
} else {
  console.log(`PASS: ${inventory.rows.length} deterministic reference rows and ${data.screens.length} data screens are registered`);
}
