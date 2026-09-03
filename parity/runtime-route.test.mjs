import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRouteParser } from "../design/reference/route.mjs";

const root = resolve(import.meta.dirname, "..");
const data = JSON.parse(readFileSync(resolve(root, "design/reference/screens.json"), "utf8"));
const parse = createRouteParser(data);
const base = "design-reference://projects?state=default&theme=light&locale=en-US&width=1280&height=800&scale=1&fixture=claude-design-desktop-reference-v1&time=2026-09-02T12%3A00%3A00.000Z&motion=frozen&network=disabled";
assert.equal(parse(base).screen.id, "projects");
for (const [label, value] of [
  ["state", base.replace("state=default", "state=unknown")],
  ["theme", base.replace("theme=light", "theme=sepia")],
  ["locale", base.replace("locale=en-US", "locale=fr")],
  ["scale", base.replace("scale=1&", "scale=1.1&")],
  ["time", base.replace("2026-09-02T12%3A00%3A00.000Z", "2026-09-03T12%3A00%3A00.000Z")],
  ["motion", base.replace("motion=frozen", "motion=live")],
  ["network", base.replace("network=disabled", "network=enabled")]
]) assert.throws(() => parse(value), new RegExp(`unsupported ${label}`, "i"));
console.log("PASS: route parser accepts the exact deterministic tuple and rejects unsupported state, theme, locale, scale, time, motion, and network values");
