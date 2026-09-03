#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRetiredRuntime } from "./check-completeness.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(scriptDir, "retired-runtime-patterns.json"), "utf8"));
const errors = validateRetiredRuntime(manifest, { scanFiles: true });
if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} retired runtime findings.`);
  for (const error of errors) console.error(` - ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS: retired runtime scan is green.");
}
