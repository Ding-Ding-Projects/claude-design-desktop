#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_INVENTORY, FEATURE_IDS, REQUIRED_SURFACE_FIELDS } from "./feature-inventory.mjs";
import { DESIGN_PARITY_INVENTORY, REQUIRED_PARITY_FIELDS } from "./design-parity-inventory.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".vue"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateIndexManifest(index) {
  const errors = [];
  if (!index || index.schemaVersion !== 1) return ["completeness-inventory.json must use schema version 1"];
  if (JSON.stringify(index.canonicalFeatureIds) !== JSON.stringify(FEATURE_IDS)) push(errors, "completeness-inventory.json feature ids differ from the executable manifest");
  if (JSON.stringify(index.surfaces) !== JSON.stringify(["desktop", "site"])) push(errors, "completeness-inventory.json must enumerate desktop and site surfaces");
  if (JSON.stringify(index.requiredSurfaceFields) !== JSON.stringify(REQUIRED_SURFACE_FIELDS)) push(errors, "completeness-inventory.json required fields differ from the executable manifest");
  if (!Array.isArray(index.negativeSelfTests) || index.negativeSelfTests.length !== mutationCases.length) push(errors, "completeness-inventory.json negative self-test list is incomplete");
  return errors;
}

function repoPathExists(repoRelativePath) {
  return fs.existsSync(path.resolve(repoRoot, repoRelativePath));
}

function validRepoPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("*") || value.includes("?")) return false;
  if (path.isAbsolute(value)) return false;
  return !value.split(/[\\/]+/u).some((part) => part === "..");
}

function push(errors, message) {
  errors.push(message);
}

function requireText(errors, value, label) {
  if (typeof value !== "string" || value.trim() === "") push(errors, `${label} must be a non-empty string`);
}

function requirePath(errors, value, label, checkFiles) {
  requireText(errors, value, label);
  if (typeof value === "string" && value.trim() !== "" && !validRepoPath(value)) {
    push(errors, `${label} must be a repository-relative literal path`);
  } else if (checkFiles && typeof value === "string" && value.trim() !== "" && !repoPathExists(value)) {
    push(errors, `${label} is missing: ${value}`);
  }
}

function validateSurface(surface, feature, surfaceName, options, errors) {
  const label = `${surfaceName}.${feature.id}`;
  for (const field of REQUIRED_SURFACE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(surface, field)) push(errors, `${label} is missing ${field}`);
  }

  const implementation = surface.implementation;
  if (!implementation || typeof implementation !== "object") {
    push(errors, `${label}.implementation must be an object`);
  } else {
    requirePath(errors, implementation.path, `${label}.implementation.path`, options.checkFiles);
    requireText(errors, implementation.symbol, `${label}.implementation.symbol`);
    requireText(errors, implementation.registration, `${label}.implementation.registration`);
    if (typeof implementation.symbol === "string" && implementation.symbol.trim() !== "" && !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(implementation.symbol)) push(errors, `${label}.implementation.symbol must be one exact source identifier`);
    const declaredRegistration = typeof implementation.registration === "string" ? /^(?:[A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*["']([^"']+)["']\s*\)$/u.exec(implementation.registration) : null;
    if (implementation.registration && (!declaredRegistration || declaredRegistration[1] !== feature.id)) push(errors, `${label}.implementation.registration must be one exact call for ${feature.id}`);
    if (options.checkSourceSymbols && typeof implementation.path === "string" && typeof implementation.symbol === "string" && repoPathExists(implementation.path)) {
      const source = stripComments(fs.readFileSync(path.resolve(repoRoot, implementation.path), "utf8"));
      const symbolPattern = new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(implementation.symbol)}\\s*(?:\\(|=|:)`, "m");
      if (!symbolPattern.test(source)) push(errors, `${label}.implementation.symbol is not registered exactly in ${implementation.path}`);
      if (typeof implementation.registration === "string") {
        const registrationMatch = /^(?:[^\r\n]*?[^A-Za-z0-9_$])?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*["']([^"']+)["']\s*\)$/u.exec(implementation.registration);
        const registrationPattern = registrationMatch
          ? new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(registrationMatch[1])}\\s*\\(\\s*["']${escapeRegExp(registrationMatch[2])}["']\\s*\\)`, "m")
          : null;
        if (!registrationPattern || !registrationPattern.test(source)) {
          push(errors, `${label}.implementation.registration is not present in ${implementation.path}`);
        }
      }
    }
  }

  const documentation = surface.documentation;
  if (!documentation || typeof documentation !== "object") {
    push(errors, `${label}.documentation must be an object`);
  } else {
    requirePath(errors, documentation.article, `${label}.documentation.article`, options.checkFiles);
    requireText(errors, documentation.heading, `${label}.documentation.heading`);
  }

  const localization = surface.localization;
  if (!localization || typeof localization !== "object") {
    push(errors, `${label}.localization must be an object`);
  } else {
    for (const language of ["en", "zhHant", "bilingual"]) {
      const record = localization[language];
      if (!record || typeof record !== "object") {
        push(errors, `${label}.localization.${language} is missing`);
      } else {
        requirePath(errors, record.path, `${label}.localization.${language}.path`, options.checkFiles);
        requireText(errors, record.key, `${label}.localization.${language}.key`);
      }
    }
  }

  const persistence = surface.persistence;
  if (!persistence || typeof persistence !== "object") {
    push(errors, `${label}.persistence must be an object`);
  } else {
    requirePath(errors, persistence.path, `${label}.persistence.path`, options.checkFiles);
    requireText(errors, persistence.key, `${label}.persistence.key`);
    requireText(errors, persistence.resetAction, `${label}.persistence.resetAction`);
  }

  const focusedTest = surface.focusedTest;
  if (!focusedTest || typeof focusedTest !== "object") {
    push(errors, `${label}.focusedTest must be an object`);
  } else {
    requirePath(errors, focusedTest.path, `${label}.focusedTest.path`, options.checkFiles);
    requireText(errors, focusedTest.testName, `${label}.focusedTest.testName`);
  }

  const interaction = surface.builtInteraction;
  if (!interaction || typeof interaction !== "object") {
    push(errors, `${label}.builtInteraction must be an object`);
  } else {
    requirePath(errors, interaction.receiptPath, `${label}.builtInteraction.receiptPath`, options.checkFiles);
    requireText(errors, interaction.route, `${label}.builtInteraction.route`);
    requireText(errors, interaction.artifactSha256, `${label}.builtInteraction.artifactSha256`);
    requirePath(errors, interaction.packageContent, `${label}.builtInteraction.packageContent`, options.checkFiles);
    const routePrefix = FEATURE_INVENTORY.surfaces[surfaceName].routePrefix;
    if (typeof interaction.route === "string" && !interaction.route.startsWith(routePrefix)) {
      push(errors, `${label}.builtInteraction.route is outside ${routePrefix}`);
    }
  }

  const capture = surface.genuineCapture;
  if (!capture || typeof capture !== "object") {
    push(errors, `${label}.genuineCapture must be an object`);
  } else {
    requirePath(errors, capture.receiptPath, `${label}.genuineCapture.receiptPath`, options.checkFiles);
    requirePath(errors, capture.capturePath, `${label}.genuineCapture.capturePath`, options.checkFiles);
    requireText(errors, capture.commitSha, `${label}.genuineCapture.commitSha`);
    requireText(errors, capture.artifactSha256, `${label}.genuineCapture.artifactSha256`);
    if (!capture.viewport || !Number.isInteger(capture.viewport.width) || !Number.isInteger(capture.viewport.height) || capture.viewport.width < 1 || capture.viewport.height < 1) {
      push(errors, `${label}.genuineCapture.viewport must have positive integer width and height`);
    }
    if (!Number.isFinite(capture.scale) || capture.scale <= 0) push(errors, `${label}.genuineCapture.scale must be positive`);
    requireText(errors, capture.theme, `${label}.genuineCapture.theme`);
  }

  const recording = surface.recording;
  if (!recording || typeof recording !== "object" || typeof recording.required !== "boolean") {
    push(errors, `${label}.recording must declare required as a boolean`);
  } else if (recording.required) {
    requirePath(errors, recording.receiptPath, `${label}.recording.receiptPath`, options.checkFiles);
    requirePath(errors, recording.path, `${label}.recording.path`, options.checkFiles);
  } else if (recording.receiptPath !== null || recording.path !== null) {
    push(errors, `${label}.recording must use null paths when motion recording is not required`);
  }

  const boundary = surface.dataBoundary;
  if (!boundary || typeof boundary !== "object") {
    push(errors, `${label}.dataBoundary must be an object`);
  } else {
    requireText(errors, boundary.statement, `${label}.dataBoundary.statement`);
    requirePath(errors, boundary.assertedBy, `${label}.dataBoundary.assertedBy`, options.checkFiles);
  }

  const availability = surface.availability;
  if (!availability || typeof availability !== "object") {
    push(errors, `${label}.availability must be an object`);
  } else {
    requirePath(errors, availability.supported, `${label}.availability.supported`, options.checkFiles);
    requirePath(errors, availability.unavailable, `${label}.availability.unavailable`, options.checkFiles);
  }

  const negativeCase = surface.negativeCase;
  if (!negativeCase || typeof negativeCase !== "object") {
    push(errors, `${label}.negativeCase must be an object`);
  } else {
    requirePath(errors, negativeCase.path, `${label}.negativeCase.path`, options.checkFiles);
    requireText(errors, negativeCase.testName, `${label}.negativeCase.testName`);
  }
}

function validateInventory(inventory, options = {}) {
  const errors = [];
  const checkFiles = options.checkFiles === true;
  const checkSourceSymbols = options.checkSourceSymbols === true;
  if (!inventory || typeof inventory !== "object") return ["inventory must be an object"];
  if (inventory.schemaVersion !== 1) push(errors, "inventory.schemaVersion must be 1");
  if (!Array.isArray(inventory.canonicalFeatureIds) || inventory.canonicalFeatureIds.length !== 30) {
    push(errors, "canonicalFeatureIds must contain exactly 30 entries");
  } else {
    const seen = new Set();
    for (const id of inventory.canonicalFeatureIds) {
      if (!/^[a-z][a-z0-9_]+$/u.test(id)) push(errors, `invalid feature id: ${String(id)}`);
      if (seen.has(id)) push(errors, `duplicate feature id: ${id}`);
      seen.add(id);
    }
    if (JSON.stringify(inventory.canonicalFeatureIds) !== JSON.stringify(FEATURE_IDS)) push(errors, "canonicalFeatureIds differ from the hand-written canonical list");
  }
  if (!inventory.versionProvenance || typeof inventory.versionProvenance !== "object") {
    push(errors, "versionProvenance is missing");
  } else {
    requirePath(errors, inventory.versionProvenance.versionPath, "versionProvenance.versionPath", checkFiles);
    requirePath(errors, inventory.versionProvenance.updatedAtPath, "versionProvenance.updatedAtPath", checkFiles);
    requireText(errors, inventory.versionProvenance.source, "versionProvenance.source");
    if (inventory.versionProvenance.timezoneRequired !== true) push(errors, "versionProvenance.timezoneRequired must be true");
    if (inventory.versionProvenance.secondsRequired !== true) push(errors, "versionProvenance.secondsRequired must be true");
    requireText(errors, inventory.versionProvenance.unavailableState, "versionProvenance.unavailableState");
  }
  if (!inventory.surfaces || typeof inventory.surfaces !== "object") {
    push(errors, "surfaces is missing");
  } else {
    for (const surfaceName of ["desktop", "site"]) {
      const surface = inventory.surfaces[surfaceName];
      if (!surface || typeof surface !== "object") {
        push(errors, `surfaces.${surfaceName} is missing`);
      } else {
        requireText(errors, surface.kind, `surfaces.${surfaceName}.kind`);
        requireText(errors, surface.routePrefix, `surfaces.${surfaceName}.routePrefix`);
      }
    }
  }
  if (!Array.isArray(inventory.features) || inventory.features.length !== 30) {
    push(errors, "features must contain exactly 30 rows");
    return errors;
  }
  const rowIds = new Set();
  for (const feature of inventory.features) {
    if (!feature || typeof feature !== "object") {
      push(errors, "feature rows must be objects");
      continue;
    }
    if (!FEATURE_IDS.includes(feature.id)) push(errors, `feature row has unknown id: ${String(feature.id)}`);
    if (rowIds.has(feature.id)) push(errors, `feature row is duplicated: ${feature.id}`);
    rowIds.add(feature.id);
    requireText(errors, feature.title, `${feature.id}.title`);
    if (typeof feature.motionApplies !== "boolean") push(errors, `${feature.id}.motionApplies must be boolean`);
    for (const surfaceName of ["desktop", "site"]) {
      if (!feature[surfaceName] || typeof feature[surfaceName] !== "object") {
        push(errors, `${feature.id}.${surfaceName} is missing`);
      } else {
        validateSurface(feature[surfaceName], feature, surfaceName, { checkFiles, checkSourceSymbols }, errors);
      }
    }
    if (feature.desktop?.recording?.required !== feature.motionApplies || feature.site?.recording?.required !== feature.motionApplies) push(errors, `${feature.id}.recording.required must match motionApplies on both surfaces`);
  }
  if (rowIds.size !== 30 || [...rowIds].some((id) => !FEATURE_IDS.includes(id))) push(errors, "features must cover every canonical feature exactly once");
  return errors;
}

function validateDesignParity(inventory, options = {}) {
  const errors = [];
  const checkFiles = options.checkFiles === true;
  if (!inventory || inventory.schemaVersion !== 1 || !Array.isArray(inventory.screens) || inventory.screens.length < 1) {
    return ["design parity inventory must declare at least one screen"];
  }
  const ids = new Set();
  for (const screen of inventory.screens) {
    if (!screen || typeof screen !== "object") {
      push(errors, "parity screen rows must be objects");
      continue;
    }
    for (const field of REQUIRED_PARITY_FIELDS) if (!Object.prototype.hasOwnProperty.call(screen, field)) push(errors, `${screen?.id || "screen"} is missing ${field}`);
    if (ids.has(screen.id)) push(errors, `duplicate parity screen id: ${screen.id}`);
    ids.add(screen.id);
    requireText(errors, screen.id, "parity screen id");
    for (const field of ["referenceFile", "materialDesignAudit", "rawReferenceCapture", "rawBuiltCapture", "sideBySide", "visualDiff"]) {
      requirePath(errors, screen[field], `${screen.id}.${field}`, checkFiles);
    }
    for (const field of ["referenceRoute", "realAppRoute", "state", "theme"]) requireText(errors, screen[field], `${screen.id}.${field}`);
    if (!screen.viewport || screen.viewport.width < 1 || screen.viewport.height < 1) push(errors, `${screen.id}.viewport must be positive`);
    if (!Number.isFinite(screen.scale) || screen.scale <= 0) push(errors, `${screen.id}.scale must be positive`);
    if (typeof screen.referenceRoute === "string") {
      for (const requiredPart of [`state=${encodeURIComponent(screen.state)}`, `theme=${encodeURIComponent(screen.theme)}`, `width=${screen.viewport.width}`, `height=${screen.viewport.height}`, `scale=${screen.scale}`]) {
        if (!screen.referenceRoute.includes(requiredPart)) push(errors, `${screen.id}.referenceRoute is missing ${requiredPart}`);
      }
    }
    if (typeof screen.realAppRoute === "string") {
      for (const requiredPart of [`state=${encodeURIComponent(screen.state)}`, `theme=${encodeURIComponent(screen.theme)}`, `width=${screen.viewport.width}`, `height=${screen.viewport.height}`, `scale=${screen.scale}`]) {
        if (!screen.realAppRoute.includes(requiredPart)) push(errors, `${screen.id}.realAppRoute is missing ${requiredPart}`);
      }
    }
    if (typeof screen.intentionalDeviation !== "object" && screen.intentionalDeviation !== null) push(errors, `${screen.id}.intentionalDeviation must be null or an object`);
    if (screen.intentionalDeviation && (typeof screen.intentionalDeviation.reason !== "string" || typeof screen.intentionalDeviation.approvedBy !== "string")) push(errors, `${screen.id}.intentionalDeviation must name reason and approval`);
  }
  return errors;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function stripComments(text) {
  let result = "";
  let quote = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];
    if (quote) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = null;
      continue;
    }
    if (current === "\"" || current === "'" || current === "`") {
      quote = current;
      result += current;
    } else if (current === "/" && next === "/") {
      result += "  ";
      index += 1;
      while (index + 1 < text.length && text[index + 1] !== "\n" && text[index + 1] !== "\r") {
        result += " ";
        index += 1;
      }
    } else if (current === "/" && next === "*") {
      result += "  ";
      index += 1;
      while (index + 1 < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        result += text[index] === "\n" || text[index] === "\r" ? text[index] : " ";
        index += 1;
      }
      if (index + 1 < text.length) {
        result += "  ";
        index += 1;
      }
    } else {
      result += current;
    }
  }
  return result;
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "quality") continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(fullPath));
    else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) found.push(fullPath);
  }
  return found;
}

function validateRetiredRuntime(manifest, options = {}) {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.rules) || manifest.rules.length < 1) return ["retired runtime manifest is empty or invalid"];
  const seen = new Set();
  for (const rule of manifest.rules) {
    if (!rule || typeof rule !== "object") {
      push(errors, "retired runtime rows must be objects");
      continue;
    }
    if (seen.has(rule.id)) push(errors, `duplicate retired runtime rule: ${rule.id}`);
    seen.add(rule.id);
    requireText(errors, rule.id, "retired runtime rule id");
    requireText(errors, rule.description, `${rule.id}.description`);
    if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) {
      push(errors, `${rule.id}.patterns must be a non-empty hand-written list`);
      continue;
    }
    for (const pattern of rule.patterns) {
      requireText(errors, pattern, `${rule.id}.pattern`);
      try { new RegExp(pattern, "m"); } catch (error) { push(errors, `${rule.id}.pattern is invalid: ${error.message}`); }
    }
  }
  if (options.scanFiles === false) return errors;
  const roots = Array.isArray(manifest.scanRoots) ? manifest.scanRoots : [];
  if (roots.length === 0) push(errors, "retired runtime scanRoots must be a non-empty hand-written list");
  for (const root of roots) {
    if (!validRepoPath(root)) {
      push(errors, `retired runtime scan root must be a repository-relative literal path: ${String(root)}`);
      continue;
    }
    for (const filePath of walkFiles(path.resolve(repoRoot, root))) {
      const relative = path.relative(repoRoot, filePath).replaceAll("\\", "/");
      const extension = path.extname(filePath).toLowerCase();
      let text = fs.readFileSync(filePath, "utf8");
      if ([".cjs", ".js", ".mjs", ".ts", ".tsx", ".vue"].includes(extension)) text = stripComments(text);
      for (const rule of manifest.rules) {
        for (const pattern of rule.patterns) {
          const expression = new RegExp(pattern, "gm");
          const match = expression.exec(text);
          if (!match) continue;
          const line = text.slice(0, match.index).split("\n").length;
          push(errors, `${rule.id}: ${relative}:${line}`);
        }
      }
    }
  }
  return errors;
}

const mutationCases = Object.freeze([
  ["implementation", (inventory) => { inventory.features[0].desktop.implementation.path = ""; }],
  ["route", (inventory) => { inventory.features[0].desktop.builtInteraction.route = ""; }],
  ["localization", (inventory) => { delete inventory.features[0].desktop.localization.en; }],
  ["article", (inventory) => { inventory.features[0].desktop.documentation.article = ""; }],
  ["test", (inventory) => { inventory.features[0].desktop.focusedTest.path = ""; }],
  ["interaction", (inventory) => { inventory.features[0].desktop.builtInteraction.receiptPath = ""; }],
  ["capture", (inventory) => { inventory.features[0].desktop.genuineCapture.capturePath = ""; }],
  ["package content", (inventory) => { inventory.features[0].desktop.builtInteraction.packageContent = ""; }],
  ["source symbol", (inventory) => { inventory.features[0].desktop.implementation.symbol = "register-language-modes"; }]
]);

export { validateInventory, validateDesignParity, validateRetiredRuntime, mutationCases };

function runSelfTests() {
  const baseline = clone(FEATURE_INVENTORY);
  const baselineErrors = validateInventory(baseline, { checkFiles: false, checkSourceSymbols: false });
  if (baselineErrors.length > 0) throw new Error(`baseline inventory shape is invalid: ${baselineErrors.join("; ")}`);
  let passed = 0;
  for (const [name, mutate] of mutationCases) {
    const broken = clone(baseline);
    mutate(broken);
    const errors = validateInventory(broken, { checkFiles: false, checkSourceSymbols: false });
    if (errors.length === 0) throw new Error(`negative self-test did not turn red: ${name}`);
    const restored = validateInventory(clone(baseline), { checkFiles: false, checkSourceSymbols: false });
    if (restored.length !== 0) throw new Error(`negative self-test did not restore green: ${name}`);
    passed += 1;
  }

  const parityBaseline = clone(DESIGN_PARITY_INVENTORY);
  if (validateDesignParity(parityBaseline, { checkFiles: false }).length !== 0) throw new Error("baseline design parity shape is invalid");
  const brokenParity = clone(parityBaseline);
  brokenParity.screens[0].referenceRoute = "";
  if (validateDesignParity(brokenParity, { checkFiles: false }).length === 0) throw new Error("design parity route self-test did not turn red");
  if (validateDesignParity(clone(parityBaseline), { checkFiles: false }).length !== 0) throw new Error("design parity route self-test did not restore green");

  const runtimeManifest = readJson(path.join(scriptDir, "retired-runtime-patterns.json"));
  if (validateRetiredRuntime(runtimeManifest, { scanFiles: false }).length !== 0) throw new Error("baseline retired runtime shape is invalid");
  const brokenRuntime = clone(runtimeManifest);
  brokenRuntime.rules[0].patterns = [];
  if (validateRetiredRuntime(brokenRuntime, { scanFiles: false }).length === 0) throw new Error("retired runtime pattern self-test did not turn red");
  if (validateRetiredRuntime(clone(runtimeManifest), { scanFiles: false }).length !== 0) throw new Error("retired runtime pattern self-test did not restore green");
  console.log(`SELF-TEST PASS: ${passed} completeness mutation cases, 1 design parity case, 1 retired-runtime case (red then green).`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) {
    runSelfTests();
    return;
  }
  const shapeOnly = args.has("--shape-only");
  const index = readJson(path.join(scriptDir, "completeness-inventory.json"));
  const indexErrors = validateIndexManifest(index);
  const inventoryErrors = validateInventory(FEATURE_INVENTORY, { checkFiles: !shapeOnly, checkSourceSymbols: !shapeOnly });
  const parityErrors = validateDesignParity(DESIGN_PARITY_INVENTORY, { checkFiles: !shapeOnly });
  const runtimeManifest = readJson(path.join(scriptDir, "retired-runtime-patterns.json"));
  const runtimeErrors = validateRetiredRuntime(runtimeManifest, { scanFiles: !shapeOnly });
  const allErrors = [
    ...indexErrors.map((error) => `COMPLETENESS_INDEX: ${error}`),
    ...inventoryErrors.map((error) => `COMPLETENESS: ${error}`),
    ...parityErrors.map((error) => `DESIGN_PARITY: ${error}`),
    ...runtimeErrors.map((error) => `RETIRED_RUNTIME: ${error}`)
  ];
  if (allErrors.length > 0) {
    console.error(`FAIL: ${allErrors.length} completeness/parity/runtime findings.`);
    for (const error of allErrors.slice(0, 160)) console.error(` - ${error}`);
    if (allErrors.length > 160) console.error(` - ... ${allErrors.length - 160} more findings`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS: completeness inventory, design parity inventory, and retired runtime scan are green.");
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}` || process.argv[1]?.endsWith("check-completeness.mjs")) main();
