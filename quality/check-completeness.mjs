#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_INVENTORY, FEATURE_IDS, REQUIRED_SURFACE_FIELDS } from "./feature-inventory.mjs";
import { DESIGN_PARITY_INVENTORY, REQUIRED_PARITY_FIELDS } from "./design-parity-inventory.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".vue", ".yaml", ".yml"]);
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PLACEHOLDER = /^(?:pending|recorded|placeholder|todo|unknown|unavailable|not[-_ ]available)/iu;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function push(errors, message) { errors.push(message); }
function requireText(errors, value, label) {
  if (typeof value !== "string" || value.trim() === "") push(errors, `${label} must be a non-empty string`);
}
function validRelative(value) {
  return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.includes("*") && !value.includes("?") && !value.split(/[\\\\/]+/u).some((part) => part === "..");
}
function absolute(root, relative) { return path.resolve(root, relative); }
function exists(root, relative) { return validRelative(relative) && fs.existsSync(absolute(root, relative)); }
function requirePath(errors, root, value, label, checkFiles) {
  requireText(errors, value, label);
  if (typeof value === "string" && value.trim() !== "" && !validRelative(value)) push(errors, `${label} must be a repository-relative literal path`);
  else if (checkFiles && !exists(root, value)) push(errors, `${label} is missing: ${value}`);
}
function requireHash(errors, value, expression, label) {
  requireText(errors, value, label);
  if (typeof value === "string" && (!expression.test(value) || PLACEHOLDER.test(value) || /^(.)\1+$/u.test(value))) push(errors, `${label} must be a real non-placeholder hash`);
}
function fileHash(root, relative) {
  return crypto.createHash("sha256").update(fs.readFileSync(absolute(root, relative))).digest("hex");
}
function sourceHash(bytes) {
  return crypto.createHash("sha1").update(bytes).digest("hex");
}
function parseEvidence(root, relative, label, errors) {
  if (!validRelative(relative) || !exists(root, relative)) return null;
  const bytes = fs.readFileSync(absolute(root, relative));
  if (bytes.length === 0) { push(errors, `${label} must not be empty`); return null; }
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) push(errors, `${label} must contain one object`);
    return value;
  } catch (error) {
    push(errors, `${label} is not valid JSON: ${error.message}`);
    return null;
  }
}
function exactTuple(value) {
  return JSON.stringify({
    language: value.language,
    state: value.state,
    theme: value.theme,
    viewport: value.viewport,
    scale: value.scale,
    time: value.time,
    motion: value.motion
  });
}
function validateEvidence(value, expected, kind, root, errors) {
  if (!value) return;
  for (const key of FEATURE_INVENTORY.receiptRequirements[kind]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) push(errors, `${expected.label}.${kind} receipt is missing ${key}`);
  }
  requireHash(errors, value.sourceSha256, SHA1, `${expected.label}.${kind}.sourceSha256`);
  requireHash(errors, value.packageSha256, SHA256, `${expected.label}.${kind}.packageSha256`);
  if (expected.packageContent && exists(root, expected.packageContent) && value.packageSha256 !== fileHash(root, expected.packageContent)) push(errors, `${expected.label}.${kind}.packageSha256 does not match package content`);
  requireText(errors, value.route, `${expected.label}.${kind}.route`);
  if (value.route !== expected.route) push(errors, `${expected.label}.${kind}.route does not match the manifest route`);
  if (!value.viewport || value.viewport.width !== expected.viewport.width || value.viewport.height !== expected.viewport.height) push(errors, `${expected.label}.${kind}.viewport does not match the manifest tuple`);
  if (value.scale !== expected.scale) push(errors, `${expected.label}.${kind}.scale does not match the manifest tuple`);
  if (value.theme !== expected.theme) push(errors, `${expected.label}.${kind}.theme does not match the manifest tuple`);
  if (value.privacyVerdict !== "verified") push(errors, `${expected.label}.${kind}.privacyVerdict must be verified`);
  if (kind === "genuineCapture") {
    requireHash(errors, value.captureSha256, SHA256, `${expected.label}.genuineCapture.captureSha256`);
    if (exists(root, expected.capturePath) && value.captureSha256 !== fileHash(root, expected.capturePath)) push(errors, `${expected.label}.genuineCapture.captureSha256 does not match capture bytes`);
  }
  if (kind === "recording") {
    requireHash(errors, value.recordingSha256, SHA256, `${expected.label}.recording.recordingSha256`);
    if (!Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0) push(errors, `${expected.label}.recording.durationSeconds must be positive`);
    if (!Number.isFinite(value.frameRate) || value.frameRate <= 0) push(errors, `${expected.label}.recording.frameRate must be positive`);
  }
}
function validateSurface(surface, feature, surfaceName, options, errors) {
  const label = `${surfaceName}.${feature.id}`;
  for (const field of REQUIRED_SURFACE_FIELDS) if (!Object.prototype.hasOwnProperty.call(surface, field)) push(errors, `${label} is missing ${field}`);
  const implementation = surface.implementation;
  if (!implementation || typeof implementation !== "object") push(errors, `${label}.implementation must be an object`);
  else {
    requirePath(errors, options.root, implementation.path, `${label}.implementation.path`, options.checkFiles);
    requireText(errors, implementation.symbol, `${label}.implementation.symbol`);
    requireText(errors, implementation.registration, `${label}.implementation.registration`);
    if (typeof implementation.symbol === "string" && implementation.symbol.trim() !== "" && !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(implementation.symbol)) push(errors, `${label}.implementation.symbol must be one exact source identifier`);
    const registration = typeof implementation.registration === "string" ? /^(?:[A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*["']([^"']+)["']\s*\)$/u.exec(implementation.registration) : null;
    if (implementation.registration && (!registration || registration[1] !== feature.id)) push(errors, `${label}.implementation.registration must be one exact call for ${feature.id}`);
    if (options.checkSourceSymbols && exists(options.root, implementation.path)) {
      const source = stripComments(fs.readFileSync(absolute(options.root, implementation.path), "utf8"));
      const symbolPattern = new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(implementation.symbol)}\\s*(?:\\(|=|:)`, "m");
      if (!symbolPattern.test(source)) push(errors, `${label}.implementation.symbol is not registered exactly in ${implementation.path}`);
      const registrationPattern = registration ? new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(registration[0])}`, "m") : null;
      if (registrationPattern && !registrationPattern.test(source)) push(errors, `${label}.implementation.registration is not present in ${implementation.path}`);
    }
  }
  const documentation = surface.documentation;
  if (!documentation || typeof documentation !== "object") push(errors, `${label}.documentation must be an object`);
  else { requirePath(errors, options.root, documentation.article, `${label}.documentation.article`, options.checkFiles); requireText(errors, documentation.heading, `${label}.documentation.heading`); }
  const localization = surface.localization;
  if (!localization || typeof localization !== "object") push(errors, `${label}.localization must be an object`);
  else for (const language of ["en", "zhHant", "bilingual"]) {
    const record = localization[language];
    if (!record || typeof record !== "object") push(errors, `${label}.localization.${language} is missing`);
    else { requirePath(errors, options.root, record.path, `${label}.localization.${language}.path`, options.checkFiles); requireText(errors, record.key, `${label}.localization.${language}.key`); }
  }
  const persistence = surface.persistence;
  if (!persistence || typeof persistence !== "object") push(errors, `${label}.persistence must be an object`);
  else { requirePath(errors, options.root, persistence.path, `${label}.persistence.path`, options.checkFiles); requireText(errors, persistence.key, `${label}.persistence.key`); requireText(errors, persistence.resetAction, `${label}.persistence.resetAction`); }
  const test = surface.focusedTest;
  if (!test || typeof test !== "object") push(errors, `${label}.focusedTest must be an object`);
  else { requirePath(errors, options.root, test.path, `${label}.focusedTest.path`, options.checkFiles); requireText(errors, test.testName, `${label}.focusedTest.testName`); }
  const interaction = surface.builtInteraction;
  if (!interaction || typeof interaction !== "object") push(errors, `${label}.builtInteraction must be an object`);
  else {
    requirePath(errors, options.root, interaction.receiptPath, `${label}.builtInteraction.receiptPath`, options.checkFiles);
    requireText(errors, interaction.route, `${label}.builtInteraction.route`);
    requirePath(errors, options.root, interaction.packageContent, `${label}.builtInteraction.packageContent`, options.checkFiles);
    if (typeof interaction.route === "string" && !interaction.route.startsWith(FEATURE_INVENTORY.surfaces[surfaceName].routePrefix)) push(errors, `${label}.builtInteraction.route is outside its surface`);
    if (options.checkReceipts) validateEvidence(parseEvidence(options.root, interaction.receiptPath, `${label}.builtInteraction.receiptPath`, errors), { label, route: interaction.route, packageContent: interaction.packageContent, viewport: { width: 1280, height: 800 }, scale: 1, theme: "light" }, "builtInteraction", options.root, errors);
  }
  const capture = surface.genuineCapture;
  if (!capture || typeof capture !== "object") push(errors, `${label}.genuineCapture must be an object`);
  else {
    requirePath(errors, options.root, capture.receiptPath, `${label}.genuineCapture.receiptPath`, options.checkFiles);
    requirePath(errors, options.root, capture.capturePath, `${label}.genuineCapture.capturePath`, options.checkFiles);
    if (options.checkReceipts) {
      const receipt = parseEvidence(options.root, capture.receiptPath, `${label}.genuineCapture.receiptPath`, errors);
      validateEvidence(receipt, { label, route: interaction?.route, packageContent: interaction?.packageContent, capturePath: capture.capturePath, viewport: { width: 1280, height: 800 }, scale: 1, theme: "light" }, "genuineCapture", options.root, errors);
    }
  }
  const recording = surface.recording;
  if (!recording || typeof recording !== "object" || typeof recording.required !== "boolean") push(errors, `${label}.recording must declare required`);
  else if (recording.required) {
    requirePath(errors, options.root, recording.receiptPath, `${label}.recording.receiptPath`, options.checkFiles);
    requirePath(errors, options.root, recording.path, `${label}.recording.path`, options.checkFiles);
    if (options.checkReceipts) validateEvidence(parseEvidence(options.root, recording.receiptPath, `${label}.recording.receiptPath`, errors), { label, route: interaction?.route, packageContent: interaction?.packageContent, viewport: { width: 1280, height: 800 }, scale: 1, theme: "light" }, "recording", options.root, errors);
  } else if (recording.receiptPath !== null || recording.path !== null) push(errors, `${label}.recording must use null paths when not required`);
  const boundary = surface.dataBoundary;
  if (!boundary || typeof boundary !== "object") push(errors, `${label}.dataBoundary must be an object`);
  else { requireText(errors, boundary.statement, `${label}.dataBoundary.statement`); requirePath(errors, options.root, boundary.assertedBy, `${label}.dataBoundary.assertedBy`, options.checkFiles); }
  const availability = surface.availability;
  if (!availability || typeof availability !== "object") push(errors, `${label}.availability must be an object`);
  else { requirePath(errors, options.root, availability.supported, `${label}.availability.supported`, options.checkFiles); requirePath(errors, options.root, availability.unavailable, `${label}.availability.unavailable`, options.checkFiles); }
  const negative = surface.negativeCase;
  if (!negative || typeof negative !== "object") push(errors, `${label}.negativeCase must be an object`);
  else { requirePath(errors, options.root, negative.path, `${label}.negativeCase.path`, options.checkFiles); requireText(errors, negative.testName, `${label}.negativeCase.testName`); }
}
function validateInventory(inventory, options = {}) {
  const errors = [];
  const root = options.root || repoRoot;
  const checkFiles = options.checkFiles === true;
  if (!inventory || typeof inventory !== "object") return ["inventory must be an object"];
  if (inventory.schemaVersion !== 1) push(errors, "inventory.schemaVersion must be 1");
  if (!Array.isArray(inventory.canonicalFeatureIds) || inventory.canonicalFeatureIds.length !== 30) push(errors, "canonicalFeatureIds must contain exactly 30 entries");
  else {
    const seen = new Set();
    for (const id of inventory.canonicalFeatureIds) { if (!/^[a-z][a-z0-9-]+$/u.test(id)) push(errors, `invalid feature id: ${String(id)}`); if (seen.has(id)) push(errors, `duplicate feature id: ${id}`); seen.add(id); }
    if (JSON.stringify(inventory.canonicalFeatureIds) !== JSON.stringify(FEATURE_IDS)) push(errors, "canonicalFeatureIds differ from the hand-written canonical list");
  }
  const provenance = inventory.versionProvenance;
  if (!provenance || typeof provenance !== "object") push(errors, "versionProvenance is missing");
  else {
    requirePath(errors, root, provenance.versionPath, "versionProvenance.versionPath", checkFiles);
    requirePath(errors, root, provenance.updatedAtPath, "versionProvenance.updatedAtPath", checkFiles);
    requirePath(errors, root, provenance.receiptPath, "versionProvenance.receiptPath", checkFiles);
    requireText(errors, provenance.source, "versionProvenance.source");
    if (provenance.timezoneRequired !== true || provenance.secondsRequired !== true) push(errors, "versionProvenance must require timezone and seconds");
    if (!Array.isArray(provenance.requiredFields) || provenance.requiredFields.length < 5) push(errors, "versionProvenance.requiredFields is incomplete");
    if (options.checkReceipts) {
      const receipt = parseEvidence(root, provenance.receiptPath, "versionProvenance.receiptPath", errors);
      if (receipt) {
        for (const field of provenance.requiredFields || []) if (!Object.prototype.hasOwnProperty.call(receipt, field)) push(errors, `versionProvenance.receipt is missing ${field}`);
        requireHash(errors, receipt.sourceSha256, SHA1, "versionProvenance.receipt.sourceSha256");
        requireHash(errors, receipt.packageSha256, SHA256, "versionProvenance.receipt.packageSha256");
        requireText(errors, receipt.version, "versionProvenance.receipt.version");
        requireText(errors, receipt.updatedAt, "versionProvenance.receipt.updatedAt");
        if (typeof receipt.updatedAt === "string" && !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/u.test(receipt.updatedAt)) push(errors, "versionProvenance.updatedAt must include seconds and timezone");
        requireText(errors, receipt.timezone, "versionProvenance.receipt.timezone");
      }
    }
  }
  if (!inventory.surfaces || typeof inventory.surfaces !== "object") push(errors, "surfaces is missing");
  else for (const surfaceName of ["desktop", "site"]) {
    const surface = inventory.surfaces[surfaceName];
    if (!surface || typeof surface !== "object") push(errors, `surfaces.${surfaceName} is missing`);
    else { requireText(errors, surface.kind, `surfaces.${surfaceName}.kind`); requireText(errors, surface.routePrefix, `surfaces.${surfaceName}.routePrefix`); }
  }
  if (!Array.isArray(inventory.features) || inventory.features.length !== 30) { push(errors, "features must contain exactly 30 rows"); return errors; }
  const rowIds = new Set();
  for (const feature of inventory.features) {
    if (!feature || typeof feature !== "object") { push(errors, "feature rows must be objects"); continue; }
    if (!FEATURE_IDS.includes(feature.id)) push(errors, `feature row has unknown id: ${String(feature.id)}`);
    if (rowIds.has(feature.id)) push(errors, `feature row is duplicated: ${feature.id}`);
    rowIds.add(feature.id);
    requireText(errors, feature.title, `${feature.id}.title`);
    if (typeof feature.motionApplies !== "boolean") push(errors, `${feature.id}.motionApplies must be boolean`);
    for (const surfaceName of ["desktop", "site"]) {
      if (!feature[surfaceName] || typeof feature[surfaceName] !== "object") push(errors, `${feature.id}.${surfaceName} is missing`);
      else validateSurface(feature[surfaceName], feature, surfaceName, { root, checkFiles, checkReceipts: options.checkReceipts === true, checkSourceSymbols: options.checkSourceSymbols === true }, errors);
    }
    if (feature.desktop?.recording?.required !== feature.motionApplies || feature.site?.recording?.required !== feature.motionApplies) push(errors, `${feature.id}.recording.required must match motionApplies`);
  }
  if (rowIds.size !== 30 || [...rowIds].some((id) => !FEATURE_IDS.includes(id))) push(errors, "features must cover every canonical feature exactly once");
  return errors;
}
function validateDesignParity(inventory, options = {}) {
  const errors = [];
  const root = options.root || repoRoot;
  if (!inventory || inventory.schemaVersion !== 1 || !Array.isArray(inventory.screens) || inventory.screens.length < 1) return ["design parity inventory must declare at least one screen"];
  if (!inventory.tupleMatrix || !Array.isArray(inventory.tupleMatrix.languages) || !Array.isArray(inventory.tupleMatrix.themes) || !Array.isArray(inventory.tupleMatrix.viewports) || !Array.isArray(inventory.tupleMatrix.scales) || !Array.isArray(inventory.tupleMatrix.times) || !Array.isArray(inventory.tupleMatrix.motion)) push(errors, "design parity tupleMatrix must enumerate language, theme, viewport, scale, time, and motion tuples");
  const matrix = inventory.tupleMatrix;
  if (matrix && options.checkTupleCoverage) {
    for (const language of matrix.languages || []) for (const theme of matrix.themes || []) for (const viewport of matrix.viewports || []) for (const scale of matrix.scales || []) for (const time of matrix.times || []) for (const motion of matrix.motion || []) {
      const expected = JSON.stringify({ language, state: "empty", theme, viewport, scale, time, motion });
      if (![...inventory.screens].some((screen) => exactTuple(screen) === expected)) push(errors, `design parity tuple is not inventoried: ${expected}`);
    }
  }
  const ids = new Set(); const tuples = new Set();
  for (const screen of inventory.screens) {
    if (!screen || typeof screen !== "object") { push(errors, "parity screen rows must be objects"); continue; }
    for (const field of REQUIRED_PARITY_FIELDS) if (!Object.prototype.hasOwnProperty.call(screen, field)) push(errors, `${screen.id || "screen"} is missing ${field}`);
    if (ids.has(screen.id)) push(errors, `duplicate parity screen id: ${screen.id}`); ids.add(screen.id);
    const tuple = exactTuple(screen);
    if (tuples.has(tuple)) push(errors, `duplicate parity tuple: ${tuple}`); tuples.add(tuple);
    for (const field of ["referenceFile","materialDesignAudit","rawReferenceCapture","rawBuiltCapture","sideBySide","visualDiff"]) requirePath(errors, root, screen[field], `${screen.id}.${field}`, options.checkFiles);
    for (const field of ["referenceRoute","realAppRoute","state","theme","language","time","motion"]) requireText(errors, screen[field], `${screen.id}.${field}`);
    if (!screen.viewport || screen.viewport.width < 1 || screen.viewport.height < 1) push(errors, `${screen.id}.viewport must be positive`);
    if (!Number.isFinite(screen.scale) || screen.scale <= 0) push(errors, `${screen.id}.scale must be positive`);
    for (const route of [screen.referenceRoute, screen.realAppRoute]) for (const required of [`state=${encodeURIComponent(screen.state)}`,`theme=${encodeURIComponent(screen.theme)}`,`language=${encodeURIComponent(screen.language)}`,`time=${encodeURIComponent(screen.time)}`,`motion=${encodeURIComponent(screen.motion)}`,`width=${screen.viewport.width}`,`height=${screen.viewport.height}`,`scale=${screen.scale}`]) if (typeof route === "string" && !route.includes(required)) push(errors, `${screen.id}.route is missing ${required}`);
    if (options.checkFiles) {
      for (const field of ["referenceFile","materialDesignAudit","rawReferenceCapture","rawBuiltCapture","sideBySide","visualDiff"]) {
        if (!exists(root, screen[field])) continue;
        const bytes = fs.readFileSync(absolute(root, screen[field]));
        if (bytes.length === 0) push(errors, `${screen.id}.${field} must not be empty`);
        if (field === "visualDiff") { try { JSON.parse(bytes.toString("utf8")); } catch (error) { push(errors, `${screen.id}.visualDiff is not valid JSON: ${error.message}`); } }
      }
      requireHash(errors, screen.referenceCaptureSha256, SHA256, `${screen.id}.referenceCaptureSha256`);
      requireHash(errors, screen.builtCaptureSha256, SHA256, `${screen.id}.builtCaptureSha256`);
      requireHash(errors, screen.visualDiffSha256, SHA256, `${screen.id}.visualDiffSha256`);
      if (exists(root, screen.rawReferenceCapture) && screen.referenceCaptureSha256 === fileHash(root, screen.rawReferenceCapture)) {}
      else if (exists(root, screen.rawReferenceCapture)) push(errors, `${screen.id}.referenceCaptureSha256 does not match bytes`);
      if (exists(root, screen.rawBuiltCapture) && screen.builtCaptureSha256 === fileHash(root, screen.rawBuiltCapture)) {}
      else if (exists(root, screen.rawBuiltCapture)) push(errors, `${screen.id}.builtCaptureSha256 does not match bytes`);
      if (exists(root, screen.visualDiff) && screen.visualDiffSha256 !== fileHash(root, screen.visualDiff)) push(errors, `${screen.id}.visualDiffSha256 does not match bytes`);
    }
  }
  return errors;
}
function escapeRegExp(value) {
  const specials = new Set([".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);
  return [...value].map((character) => specials.has(character) ? `\\${character}` : character).join("");
}
function stripComments(text) {
  let result = ""; let quote = null; let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const current = text[i]; const next = text[i + 1];
    if (quote) { result += current; if (escaped) escaped = false; else if (current === "\\") escaped = true; else if (current === quote) quote = null; continue; }
    if (current === "\"" || current === "'" || current === "\`") { quote = current; result += current; }
    else if (current === "/" && next === "/") { result += "  "; i += 1; while (i + 1 < text.length && text[i + 1] !== "\n" && text[i + 1] !== "\r") { result += " "; i += 1; } }
    else if (current === "/" && next === "*") { result += "  "; i += 1; while (i + 1 < text.length && !(text[i] === "*" && text[i + 1] === "/")) { result += text[i] === "\n" || text[i] === "\r" ? text[i] : " "; i += 1; } if (i + 1 < text.length) { result += "  "; i += 1; } }
    else result += current;
  }
  return result;
}
function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if ([".git","node_modules","quality"].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(full));
    else if (textExtensions.has(path.extname(entry.name).toLowerCase()) || full.includes("dist") || full.includes("staged-package")) found.push(full);
  }
  return found;
}
function validateRetiredRuntime(manifest, options = {}) {
  const errors = [];
  const root = options.root || repoRoot;
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.rules) || manifest.rules.length < 1) return ["retired runtime manifest is empty or invalid"];
  const ids = new Set();
  for (const rule of manifest.rules) {
    if (!rule || typeof rule !== "object") { push(errors, "retired runtime rows must be objects"); continue; }
    if (ids.has(rule.id)) push(errors, `duplicate retired runtime rule: ${rule.id}`); ids.add(rule.id);
    requireText(errors, rule.id, "retired runtime rule id"); requireText(errors, rule.description, `${rule.id}.description`);
    if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) { push(errors, `${rule.id}.patterns must be a non-empty hand-written list`); continue; }
    for (const pattern of rule.patterns) { requireText(errors, pattern, `${rule.id}.pattern`); try { new RegExp(pattern, "m"); } catch (error) { push(errors, `${rule.id}.pattern is invalid: ${error.message}`); } }
  }
  if (options.scanFiles === false) return errors;
  const roots = Array.isArray(manifest.scanRoots) ? manifest.scanRoots : [];
  if (roots.length === 0) push(errors, "retired runtime scanRoots must be a non-empty hand-written list");
  const scanned = new Set();
  for (const relativeRoot of roots) {
    if (!validRelative(relativeRoot)) { push(errors, `retired runtime scan root must be relative: ${String(relativeRoot)}`); continue; }
    for (const file of walkFiles(absolute(root, relativeRoot))) {
      if (scanned.has(file)) continue; scanned.add(file);
      let source = fs.readFileSync(file, "utf8");
      if ([".cjs",".js",".mjs",".ts",".tsx",".vue"].includes(path.extname(file).toLowerCase())) source = stripComments(source);
      const relative = path.relative(root, file).replaceAll("\\", "/");
      for (const rule of manifest.rules) for (const pattern of rule.patterns) {
        const match = new RegExp(pattern, "gm").exec(source);
        if (match) push(errors, `${rule.id}: ${relative}:${source.slice(0, match.index).split("\n").length}`);
      }
    }
  }
  return errors;
}
const mutationCases = Object.freeze([
  ["fixture-file", (root, inventory) => { fs.rmSync(absolute(root, inventory.features[0].desktop.implementation.path)); }],
  ["source-symbol", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.implementation.path); fs.writeFileSync(p, "registerFeature(\"language-modes\");", "utf8"); }],
  ["registration", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.implementation.path); fs.writeFileSync(p, "function registerLanguageModesFeature() {}", "utf8"); }],
  ["localization", (root, inventory) => { fs.rmSync(absolute(root, inventory.features[0].desktop.localization.en.path)); }],
  ["article", (root, inventory) => { fs.rmSync(absolute(root, inventory.features[0].desktop.documentation.article)); }],
  ["test", (root, inventory) => { fs.rmSync(absolute(root, inventory.features[0].desktop.focusedTest.path)); }],
  ["interaction", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.builtInteraction.receiptPath); const r = readJson(p); r.route = "wrong-route"; fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["capture", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.genuineCapture.receiptPath); const r = readJson(p); r.captureSha256 = "f".repeat(64); fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["package-record", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.builtInteraction.receiptPath); const r = readJson(p); r.packageSha256 = "e".repeat(64); fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["provenance", (root, inventory) => { const p = absolute(root, inventory.versionProvenance.receiptPath); const r = readJson(p); r.updatedAt = "not-a-timestamp"; fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["parity-tuple", (_root, _inventory, parity) => { parity.screens[0].scale = 9; }],
  ["parity-duplicate-tuple", (_root, _inventory, parity) => { parity.screens[1].language = parity.screens[0].language; parity.screens[1].theme = parity.screens[0].theme; parity.screens[1].state = parity.screens[0].state; parity.screens[1].time = parity.screens[0].time; parity.screens[1].motion = parity.screens[0].motion; }],
  ["retired-package-content", (root) => { const p = absolute(root, "packages/staged-package/package.cjs"); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, "const DEFAULT_ME = {};"); }]
]);
function makeFixtureRoot(inventory, parity, destination = null) {
  const root = destination || fs.mkdtempSync(path.join(os.tmpdir(), "claude-design-guards-"));
  const touch = (relative, body = "fixture") => { const p = absolute(root, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  const write = (relative, value) => touch(relative, JSON.stringify(value));
  touch(inventory.versionProvenance.versionPath, JSON.stringify({ version: "1.0.0" }));
  touch(inventory.versionProvenance.updatedAtPath, "provenance");
  const now = "2026-09-02T12:00:00Z";
  write(inventory.versionProvenance.receiptPath, { version: "1.0.0", updatedAt: now, timezone: "UTC", sourceSha256: sourceHash(Buffer.from("provenance")), packageSha256: fileHash(root, inventory.versionProvenance.updatedAtPath) });
  for (const feature of inventory.features) for (const kind of ["desktop","site"]) {
    const surface = feature[kind]; const source = `// fixture\nfunction ${surface.implementation.symbol}() {}\n${surface.implementation.registration}\n`;
    touch(surface.implementation.path, source); touch(surface.documentation.article, `# ${surface.documentation.heading}`);
    for (const locale of Object.values(surface.localization)) touch(locale.path, "{}");
    touch(surface.persistence.path, "export const state = {};");
    touch(surface.focusedTest.path, "test(\"fixture\", () => {});");
    touch(surface.builtInteraction.packageContent, "package");
    const base = { sourceSha256: sourceHash(Buffer.from(source)), packageSha256: fileHash(root, surface.builtInteraction.packageContent), route: surface.builtInteraction.route, viewport: { width: 1280, height: 800 }, scale: 1, theme: "light", privacyVerdict: "verified" };
    write(surface.builtInteraction.receiptPath, base);
    const captureBytes = Buffer.from(`capture-${kind}-${feature.id}`);
    touch(surface.genuineCapture.capturePath, captureBytes.toString("utf8"));
    write(surface.genuineCapture.receiptPath, { ...base, captureSha256: crypto.createHash("sha256").update(captureBytes).digest("hex") });
    if (surface.recording.required) { touch(surface.recording.path, "recording"); write(surface.recording.receiptPath, { ...base, recordingSha256: fileHash(root, surface.recording.path), durationSeconds: 1, frameRate: 30 }); }
    touch(surface.dataBoundary.assertedBy, "{}"); touch(surface.availability.supported, "{}"); touch(surface.availability.unavailable, "{}"); touch(surface.negativeCase.path, "export {};");
  }
  for (const screen of parity.screens) {
    touch(screen.referenceFile, "<!doctype html>");
    touch(screen.materialDesignAudit, "{}");
    touch(screen.rawReferenceCapture, `reference-${screen.id}`);
    touch(screen.rawBuiltCapture, `built-${screen.id}`);
    touch(screen.sideBySide, `compare-${screen.id}`);
    touch(screen.visualDiff, "{}");
  }
  return root;
}
function hydrateParityHashes(parity, root) {
  for (const screen of parity.screens) {
    screen.referenceCaptureSha256 = fileHash(root, screen.rawReferenceCapture);
    screen.builtCaptureSha256 = fileHash(root, screen.rawBuiltCapture);
    screen.visualDiffSha256 = fileHash(root, screen.visualDiff);
  }
}
function fixtureFingerprint(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push([path.relative(root, file), fileHash(root, path.relative(root, file))]);
    }
  };
  visit(root);
  return files.sort((left, right) => left[0].localeCompare(right[0]));
}
function validateIndexManifest(index) {
  const errors = [];
  if (!index || index.schemaVersion !== 1) return ["completeness-inventory.json must use schema version 1"];
  if (JSON.stringify(index.canonicalFeatureIds) !== JSON.stringify(FEATURE_IDS)) push(errors, "JSON index feature ids differ from executable manifest");
  if (JSON.stringify(index.surfaces) !== JSON.stringify(["desktop","site"])) push(errors, "JSON index surfaces are incomplete");
  if (JSON.stringify(index.requiredSurfaceFields) !== JSON.stringify(REQUIRED_SURFACE_FIELDS)) push(errors, "JSON index required fields differ");
  if (!Array.isArray(index.negativeSelfTests) || index.negativeSelfTests.length !== mutationCases.length) push(errors, "JSON index negative self-test list is incomplete");
  return errors;
}
export { validateInventory, validateDesignParity, validateRetiredRuntime, mutationCases };

function runSelfTests() {
  const baselineInventory = clone(FEATURE_INVENTORY);
  const baselineParity = clone(DESIGN_PARITY_INVENTORY);
  const root = makeFixtureRoot(baselineInventory, baselineParity);
  hydrateParityHashes(baselineParity, root);
  const index = readJson(path.join(scriptDir, "completeness-inventory.json"));
  if (validateIndexManifest(index).length) throw new Error("JSON index baseline is invalid");
  if (validateInventory(baselineInventory, { root, checkFiles: true, checkReceipts: true, checkSourceSymbols: true }).length) throw new Error("fixture inventory baseline is invalid");
  if (validateDesignParity(baselineParity, { root, checkFiles: true, checkTupleCoverage: false }).length) throw new Error("fixture design parity baseline is invalid");
  for (const [name, mutate] of mutationCases) {
    const inventory = clone(baselineInventory); const parity = clone(baselineParity);
    const before = JSON.stringify({ inventory, parity, files: fixtureFingerprint(root) });
    mutate(root, inventory, parity);
    const after = JSON.stringify({ inventory, parity, files: fixtureFingerprint(root) });
    if (before === after) throw new Error(`mutation did not land: ${name}`);
    const errors = name.startsWith("parity-") ? validateDesignParity(parity, { root, checkFiles: false }) : name === "retired-package-content" ? validateRetiredRuntime(readJson(path.join(scriptDir, "retired-runtime-patterns.json")), { root, scanFiles: true }) : validateInventory(inventory, { root, checkFiles: true, checkReceipts: true, checkSourceSymbols: true });
    if (errors.length === 0) throw new Error(`negative self-test did not turn red: ${name}`);
    fs.rmSync(root, { recursive: true, force: true });
    const restoredRoot = makeFixtureRoot(baselineInventory, baselineParity);
    const restoredErrors = validateInventory(baselineInventory, { root: restoredRoot, checkFiles: true, checkReceipts: true, checkSourceSymbols: true });
    if (restoredErrors.length !== 0) throw new Error(`negative self-test did not restore green: ${name}`);
    fs.rmSync(restoredRoot, { recursive: true, force: true });
    makeFixtureRoot(baselineInventory, baselineParity, root);
  }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`SELF-TEST PASS: ${mutationCases.filter(([name]) => name !== "retired-package-content").length} fixture mutation cases, 2 parity cases, 1 retired-package case (red then green).`);
}
function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) { runSelfTests(); return; }
  const shapeOnly = args.has("--shape-only");
  const indexErrors = validateIndexManifest(readJson(path.join(scriptDir, "completeness-inventory.json")));
  const inventoryErrors = validateInventory(FEATURE_INVENTORY, { root: repoRoot, checkFiles: !shapeOnly, checkReceipts: !shapeOnly, checkSourceSymbols: !shapeOnly });
  const parityErrors = validateDesignParity(DESIGN_PARITY_INVENTORY, { root: repoRoot, checkFiles: !shapeOnly, checkTupleCoverage: !shapeOnly });
  const retiredManifest = readJson(path.join(scriptDir, "retired-runtime-patterns.json"));
  const retiredErrors = validateRetiredRuntime(retiredManifest, { root: repoRoot, scanFiles: !shapeOnly });
  const all = [...indexErrors.map((x) => `COMPLETENESS_INDEX: ${x}`), ...inventoryErrors.map((x) => `COMPLETENESS: ${x}`), ...parityErrors.map((x) => `DESIGN_PARITY: ${x}`), ...retiredErrors.map((x) => `RETIRED_RUNTIME: ${x}`)];
  if (all.length) { console.error(`FAIL: ${all.length} completeness/parity/runtime findings.`); for (const error of all.slice(0, 160)) console.error(` - ${error}`); if (all.length > 160) console.error(` - ... ${all.length - 160} more findings`); process.exitCode = 1; }
  else console.log("PASS: completeness inventory, design parity inventory, and retired runtime scan are green.");
}
if (process.argv[1]?.endsWith("check-completeness.mjs")) main();
