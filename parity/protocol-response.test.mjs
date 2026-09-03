import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRouteParser } from "../design/reference/route.mjs";
import { resolveProtocolResponse } from "../design/reference/protocol-response.mjs";

const root = resolve(import.meta.dirname, "..");
const data = JSON.parse(readFileSync(resolve(root, "design/reference/screens.json"), "utf8"));
const inventory = JSON.parse(readFileSync(resolve(root, "parity/inventory.json"), "utf8"));
const parseRoute = createRouteParser(data);
const files = { "/index.html": [resolve(root, "design/reference/index.html"), "text/html"], "/app.js": [resolve(root, "design/reference/app.js"), "text/javascript"], "/styles.css": [resolve(root, "design/reference/styles.css"), "text/css"] };
for (const row of inventory.rows) {
  const response = resolveProtocolResponse(row.designRoute, { parseRoute, files });
  assert.ok(response, `missing response for ${row.id}`);
  assert.equal(response.path, files["/index.html"][0], `canonical route must serve index for ${row.id}`);
  assert.equal(response.contentType, "text/html", `canonical route must serve HTML for ${row.id}`);
  assert.equal(response.route.screen.id, row.screen, `response screen mismatch for ${row.id}`);
  assert.equal(response.route.state, row.state, `response state mismatch for ${row.id}`);
  assert.equal(existsSync(response.path), true, `response source missing for ${row.id}`);
}
const slash = resolveProtocolResponse(inventory.rows[0].designRoute.replace("design-reference://signin", "design-reference://signin/"), { parseRoute, files });
assert.equal(slash.path, files["/index.html"][0], "slash route must serve index");
console.log(`PASS: protocol response resolves the checked-in index for all ${inventory.rows.length} inventoried design URLs and slash variants`);
