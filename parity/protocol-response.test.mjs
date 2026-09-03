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
const knownScreens = new Set(data.screens.map((item) => item.id));
for (const row of inventory.rows) {
  const response = resolveProtocolResponse(row.designRoute, { parseRoute, files, knownScreens });
  assert.ok(response, `missing response for ${row.id}`);
  assert.equal(response.status, 200, `entry response status mismatch for ${row.id}`);
  assert.equal(response.path, files["/index.html"][0], `canonical route must serve index for ${row.id}`);
  assert.equal(response.contentType, "text/html", `canonical route must serve HTML for ${row.id}`);
  assert.equal(response.route.screen.id, row.screen, `response screen mismatch for ${row.id}`);
  assert.equal(response.route.state, row.state, `response state mismatch for ${row.id}`);
  assert.equal(existsSync(response.path), true, `response source missing for ${row.id}`);
}
for (const host of knownScreens) {
  const staticApp = resolveProtocolResponse(`design-reference://${host}/app.js`, { parseRoute, files, knownScreens });
  assert.equal(staticApp.status, 200, `app.js response must be 200 for ${host}`);
  assert.equal(staticApp.contentType, "text/javascript", `app.js response content type mismatch for ${host}`);
  const staticStyles = resolveProtocolResponse(`design-reference://${host}/styles.css`, { parseRoute, files, knownScreens });
  assert.equal(staticStyles.status, 200, `styles.css response must be 200 for ${host}`);
  assert.equal(staticStyles.contentType, "text/css", `styles.css response content type mismatch for ${host}`);
}
assert.throws(() => resolveProtocolResponse("design-reference://signin/app.js?state=default", { parseRoute, files, knownScreens }), /omit the deterministic tuple query/i);
assert.throws(() => resolveProtocolResponse("design-reference://other/app.js", { parseRoute, files, knownScreens }), /known reference screen/i);
assert.equal(resolveProtocolResponse("design-reference://signin/secret.txt", { parseRoute, files, knownScreens }), null, "unknown static paths must be refused");
assert.throws(() => resolveProtocolResponse("design-reference://signin", { parseRoute, files, knownScreens }).route, /query keys/i);
const slash = resolveProtocolResponse(inventory.rows[0].designRoute.replace("design-reference://signin", "design-reference://signin/"), { parseRoute, files, knownScreens });
assert.equal(slash.status, 200, "slash entry response must be 200");
assert.equal(slash.path, files["/index.html"][0], "slash route must serve index");
console.log(`PASS: protocol response returns 200 and exact content types for all ${inventory.rows.length} inventoried entries and allowlisted static resources, while refusing query-bearing or unknown resources`);
