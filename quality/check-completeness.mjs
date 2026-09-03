#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
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
function sourceHash(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
let cachedMediaFixtures;
function makeMediaFixtures() {
  if (cachedMediaFixtures) return cachedMediaFixtures;
  const render = (codec, format, extra = []) => execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=2x2:d=0.2", "-frames:v", "2", "-c:v", codec, ...extra, "-f", format, "pipe:1"], { stdio: ["ignore", "pipe", "ignore"] });
  cachedMediaFixtures = { png: render("png", "image2pipe", ["-frames:v", "1"]), webp: render("libwebp", "webp", ["-lossless", "1"]), webm: render("libvpx-vp9", "webm") };
  return cachedMediaFixtures;
}
function gitCommit(root) {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
}
const ancestorCache = new Map();
function gitCommitIsAncestor(root, source, current) {
  if (!source || !current) return false;
  const key = `${root}|${source}|${current}`;
  if (ancestorCache.has(key)) return ancestorCache.get(key);
  let result = false;
  try { execFileSync("git", ["merge-base", "--is-ancestor", source, current], { cwd: root, stdio: "ignore" }); result = true; } catch { result = false; }
  ancestorCache.set(key, result); return result;
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
function mediaInfo(bytes, format) {
  if (format === "png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let offset = 8; let sawHeader = false; let sawData = false; let sawEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset); const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
      if (length > bytes.length - offset - 12) return null;
      const payload = bytes.subarray(offset + 8, offset + 8 + length); const crc = bytes.readUInt32BE(offset + 8 + length);
      if (crc32(Buffer.concat([Buffer.from(type), payload])) !== crc) return null;
      if (type === "IHDR" && length === 13) sawHeader = payload.readUInt32BE(0) > 0 && payload.readUInt32BE(4) > 0;
      if (type === "IDAT" && length > 0) sawData = true;
      if (type === "IEND") { sawEnd = true; break; }
      offset += 12 + length;
    }
    if (!sawHeader || !sawData || !sawEnd) return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), frames: 1 };
  }
  if (format === "webp" && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X" && bytes.length >= 30 && bytes.length >= 20 + bytes.readUInt32LE(16)) return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), frames: bytes[20] & 2 ? 2 : 1 };
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, frames: 1 };
  }
  if (format === "webm" && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    let width = 0; let height = 0;
    for (let i = 0; i + 2 < bytes.length; i += 1) {
      if (bytes[i] !== 0xb0 && bytes[i] !== 0xba) continue;
      const sizeByte = bytes[i + 1]; if (!sizeByte || (sizeByte & 0x80) === 0) continue;
      let mask = 0x80; let length = 1; while ((sizeByte & mask) === 0 && length < 8) { mask >>= 1; length += 1; }
      const size = mask; length = sizeByte & (size - 1);
      if (length < 1 || length > 4 || i + 2 + length > bytes.length) continue;
      const value = bytes.readUIntBE(i + 2, length);
      if (bytes[i] === 0xb0) width = value; else height = value;
    }
    const frames = bytes.includes(Buffer.from([0xa3])) || bytes.includes(Buffer.from([0x1f, 0x43, 0xb6, 0x75])) ? 1 : 0;
    if (width > 0 && height > 0 && frames > 0) return { width, height, frames };
  }
  return null;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function validateMediaFile(root, relative, format, label, errors) {
  if (!exists(root, relative)) return null;
  const bytes = fs.readFileSync(absolute(root, relative));
  const info = mediaInfo(bytes, format);
  if (!info || info.width < 1 || info.height < 1 || info.frames < 1) push(errors, `${label} must have a valid ${format} signature, dimensions, and frame`);
  return info;
}
function asarPayload(bytes) {
  if (bytes.subarray(0, 1).toString("utf8") === "{") return bytes.toString("utf8");
  if (bytes.length < 8) return null;
  const headerSize = bytes.readUInt32LE(4); if (headerSize < 2 || headerSize > bytes.length - 8) return null;
  return bytes.subarray(8, 8 + headerSize).toString("utf8");
}
function makePeFixture() { const bytes = Buffer.alloc(128); bytes.write("MZ", 0, "ascii"); bytes.writeUInt32LE(0x40, 0x3c); bytes.set([0x50, 0x45, 0, 0], 0x40); bytes.writeUInt16LE(0x14c, 0x44); bytes.writeUInt16LE(1, 0x46); bytes.writeUInt16LE(0xe0, 0x54); bytes.writeUInt16LE(0x010f, 0x56); return bytes; }
function makeZip(entries) {
  const local = []; const central = []; let offset = 0;
  for (const [name, data] of entries) { const nameBytes = Buffer.from(name); const body = Buffer.isBuffer(data) ? data : Buffer.from(data); const crc = crc32(body); const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14); header.writeUInt32LE(body.length, 18); header.writeUInt32LE(body.length, 22); header.writeUInt16LE(nameBytes.length, 26); local.push(header, nameBytes, body); const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(body.length, 20); directory.writeUInt32LE(body.length, 24); directory.writeUInt16LE(nameBytes.length, 28); directory.writeUInt32LE(offset, 42); central.push(directory, nameBytes); offset += header.length + nameBytes.length + body.length; }
  const directoryBytes = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directoryBytes.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, directoryBytes, end]);
}
function zipMembers(bytes) { const members = new Map(); for (let i = 0; i + 46 <= bytes.length; i += 1) if (bytes.readUInt32LE(i) === 0x02014b50) { const length = bytes.readUInt16LE(i + 28); const extra = bytes.readUInt16LE(i + 30); const comment = bytes.readUInt16LE(i + 32); const method = bytes.readUInt16LE(i + 10); const compressed = bytes.readUInt32LE(i + 20); const uncompressed = bytes.readUInt32LE(i + 24); const offset = bytes.readUInt32LE(i + 42); const name = bytes.subarray(i + 46, i + 46 + length).toString("utf8"); if (name.startsWith("/") || name.split("/").includes("..") || method !== 0 || offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) continue; const localName = bytes.readUInt16LE(offset + 26); const localExtra = bytes.readUInt16LE(offset + 28); const bodyStart = offset + 30 + localName + localExtra; const body = bytes.subarray(bodyStart, bodyStart + compressed); if (body.length !== compressed || compressed !== uncompressed || crc32(body) !== bytes.readUInt32LE(i + 16)) continue; members.set(name, body); i += 46 + length + extra + comment - 1; } return members; }
function makeAsarFixture() { const payload = Buffer.from(JSON.stringify({ files: { "package.json": {}, "app.js": {} } })); const header = Buffer.alloc(8); header.writeUInt32LE(4, 0); header.writeUInt32LE(payload.length, 4); return Buffer.concat([header, payload]); }
function validatePackageEvidence(value, expected, runtimeManifest, root, errors) {
  if (!value || typeof value !== "object") { push(errors, `${expected.label}.builtInteraction.package must be an object`); return; }
  for (const field of ["setupExe", "releases", "fullNupkg", "asar", "packageMembership"]) if (!Object.prototype.hasOwnProperty.call(value, field)) push(errors, `${expected.label}.builtInteraction.package is missing ${field}`);
  for (const field of ["setupExe", "releases", "fullNupkg", "asar"]) { if (typeof value[field] === "string") requirePath(errors, root, value[field], `${expected.label}.package.${field}`, true); }
  if (Array.isArray(value.deltaNupkg)) for (const [index, item] of value.deltaNupkg.entries()) requirePath(errors, root, item, `${expected.label}.package.deltaNupkg[${index}]`, true);
  else push(errors, `${expected.label}.builtInteraction.package.deltaNupkg must be a non-empty list`);
  if (exists(root, value.setupExe)) { const bytes = fs.readFileSync(absolute(root, value.setupExe)); if (bytes.subarray(0, 2).toString("ascii") !== "MZ" || bytes.readUInt32LE(0x3c) + 4 > bytes.length || bytes.subarray(bytes.readUInt32LE(0x3c), bytes.readUInt32LE(0x3c) + 4).toString("ascii") !== "PE\0\0") push(errors, `${expected.label}.package.setupExe is not a PE executable`); }
  const zipNames = (relative, suffix) => { if (!exists(root, relative)) return new Map(); const bytes = fs.readFileSync(absolute(root, relative)); if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) { push(errors, `${expected.label}.package.${suffix} is not a ZIP package`); return new Map(); } const names = zipMembers(bytes); if (names.size === 0) push(errors, `${expected.label}.package.${suffix} has no valid central directory entries`); return names; };
  const fullNames = zipNames(value.fullNupkg, "fullNupkg"); const deltaNames = (value.deltaNupkg || []).map((item, index) => zipNames(item, `deltaNupkg[${index}]`));
  for (const [relative, label] of [[value.fullNupkg, "fullNupkg"], ...(value.deltaNupkg || []).map((item, index) => [item, `deltaNupkg[${index}]`])]) if (exists(root, relative)) for (const rule of runtimeManifest?.rules || []) for (const pattern of rule.patterns) if (new RegExp(pattern, "m").test(fs.readFileSync(absolute(root, relative)).toString("utf8"))) push(errors, `${expected.label}.package.${label} contains retired runtime rule ${rule.id}`);
  if (exists(root, value.releases) && exists(root, value.fullNupkg)) { const text = fs.readFileSync(absolute(root, value.releases), "utf8"); if (!text.includes(path.basename(value.fullNupkg)) || (value.deltaNupkg || []).some((item) => !text.includes(path.basename(item)))) push(errors, `${expected.label}.package.RELEASES does not reference every package`); }
  if (exists(root, value.asar)) { const payload = asarPayload(fs.readFileSync(absolute(root, value.asar))); if (!payload) push(errors, `${expected.label}.package.asar has no readable package header`); else { let tree; try { tree = JSON.parse(payload); } catch { tree = null; push(errors, `${expected.label}.package.asar header is not valid JSON`); } for (const item of value.asarMembership || []) if (!tree?.files || !Object.prototype.hasOwnProperty.call(tree.files, item)) push(errors, `${expected.label}.package.asar is missing member ${item}`); for (const rule of runtimeManifest?.rules || []) for (const pattern of rule.patterns) if (new RegExp(pattern, "m").test(payload)) push(errors, `${expected.label}.package.asar contains retired runtime rule ${rule.id}`); } }
  if (!Array.isArray(value.packageMembership) || value.packageMembership.length === 0) push(errors, `${expected.label}.package.packageMembership must be non-empty`);
  else for (const item of value.packageMembership) if (!fullNames.has(item)) push(errors, `${expected.label}.package.packageMembership is outside full nupkg: ${item}`);
  if (!Array.isArray(value.nupkgMembership) || value.nupkgMembership.length === 0) push(errors, `${expected.label}.package.nupkgMembership must be non-empty`);
  else for (const item of value.nupkgMembership) if (!fullNames.has(item)) push(errors, `${expected.label}.package.nupkgMembership missing from full nupkg: ${item}`);
  if (Array.isArray(value.deltaNupkgMembership)) for (const [index, members] of value.deltaNupkgMembership.entries()) for (const item of members || []) if (!deltaNames[index]?.has(item)) push(errors, `${expected.label}.package.deltaNupkgMembership missing from delta nupkg: ${item}`);
  for (const [name, body] of fullNames) for (const rule of runtimeManifest?.rules || []) for (const pattern of rule.patterns) if (new RegExp(pattern, "m").test(body.toString("utf8"))) push(errors, `${expected.label}.package.fullNupkg member ${name} contains retired runtime rule ${rule.id}`);
}
function validatePrivacyEvidence(root, relative, label, expected, errors) {
  const value = parseEvidence(root, relative, label, errors); if (!value) return;
  for (const field of ["sourceCommit", "packageSha256", "interactionId", "noNetworkProof"]) requireText(errors, value[field], `${label}.${field}`);
  requireHash(errors, value.packageSha256, SHA256, `${label}.packageSha256`);
  requireHash(errors, value.sourceCommit, SHA1, `${label}.sourceCommit`);
  if (expected.gitCommit && !gitCommitIsAncestor(root, value.sourceCommit, expected.gitCommit)) push(errors, `${label}.sourceCommit is not in Git provenance`);
  if (expected.packageSha256 && value.packageSha256 !== expected.packageSha256) push(errors, `${label}.packageSha256 does not match built package`);
  if (expected.interactionId && value.interactionId !== expected.interactionId) push(errors, `${label}.interactionId does not match built interaction`);
  if (!Number.isInteger(value.networkRequests) || value.networkRequests !== 0) push(errors, `${label} networkRequests must be zero`);
  if (value.privacyVerdict !== "verified") push(errors, `${label} privacyVerdict must be verified`);
  if (!(["local-only", "declared-external"] ).includes(value.boundaryType)) push(errors, `${label} boundaryType must be local-only or declared-external`);
  if (!(["none", "declared"] ).includes(value.networkAccess)) push(errors, `${label} networkAccess must be none or declared`);
  if (value.redacted !== true) push(errors, `${label} redacted must be true`);
}
function validateAvailabilityEvidence(root, relative, label, expectedState, expected, errors) {
  const value = parseEvidence(root, relative, label, errors); if (!value) return;
  for (const field of ["sourceCommit", "packageSha256", "interactionId"]) requireText(errors, value[field], `${label}.${field}`);
  requireHash(errors, value.packageSha256, SHA256, `${label}.packageSha256`);
  requireHash(errors, value.sourceCommit, SHA1, `${label}.sourceCommit`);
  if (expected.gitCommit && !gitCommitIsAncestor(root, value.sourceCommit, expected.gitCommit)) push(errors, `${label}.sourceCommit is not in Git provenance`);
  if (expected.packageSha256 && value.packageSha256 !== expected.packageSha256) push(errors, `${label}.packageSha256 does not match built package`);
  if (expected.interactionId && value.interactionId !== expected.interactionId) push(errors, `${label}.interactionId does not match built interaction`);
  if (value.state !== expectedState) push(errors, `${label} state must be ${expectedState}`);
  requireText(errors, value.reason, `${label}.reason`); requireText(errors, value.recovery, `${label}.recovery`); requireText(errors, value.verifiedAt, `${label}.verifiedAt`);
}
function validateDesignAudit(root, relative, label, errors) {
  const value = parseEvidence(root, relative, label, errors); if (!value) return;
  if (value.designSystem !== "Material Design 3" || value.primitives !== "verified" || value.controls !== "verified" || value.accessibility !== "verified") push(errors, `${label} must semantically verify the Material Design 3 audit`);
}
function validateVisualDiff(root, relative, label, errors) {
  const value = parseEvidence(root, relative, label, errors); if (!value) return;
  requireHash(errors, value.referenceSha256, SHA256, `${label}.referenceSha256`); requireHash(errors, value.builtSha256, SHA256, `${label}.builtSha256`);
  if (!Number.isInteger(value.changedPixels) || value.changedPixels < 0 || !Number.isFinite(value.threshold) || value.threshold < 0) push(errors, `${label} must contain changedPixels and threshold`);
  if (!["identical", "reviewed-difference"].includes(value.verdict)) push(errors, `${label}.verdict must be identical or reviewed-difference`);
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
  requireHash(errors, value.sourceSha256, SHA256, `${expected.label}.${kind}.sourceSha256`);
  requireHash(errors, value.sourceCommit, SHA1, `${expected.label}.${kind}.sourceCommit`);
  if (expected.implementationPath && exists(root, expected.implementationPath) && value.sourceSha256 !== fileHash(root, expected.implementationPath)) push(errors, `${expected.label}.${kind}.sourceSha256 does not match implementation bytes`);
  if (expected.gitCommit && !gitCommitIsAncestor(root, value.sourceCommit, expected.gitCommit)) push(errors, `${expected.label}.${kind}.sourceCommit is not in Git provenance`);
  requireHash(errors, value.packageSha256, SHA256, `${expected.label}.${kind}.packageSha256`);
  if (expected.packageContent && exists(root, expected.packageContent) && value.packageSha256 !== fileHash(root, expected.packageContent)) push(errors, `${expected.label}.${kind}.packageSha256 does not match package content`);
  requireText(errors, value.route, `${expected.label}.${kind}.route`);
  if (value.route !== expected.route) push(errors, `${expected.label}.${kind}.route does not match the manifest route`);
  if (!value.viewport || value.viewport.width !== expected.viewport.width || value.viewport.height !== expected.viewport.height) push(errors, `${expected.label}.${kind}.viewport does not match the manifest tuple`);
  if (value.scale !== expected.scale) push(errors, `${expected.label}.${kind}.scale does not match the manifest tuple`);
  if (value.theme !== expected.theme) push(errors, `${expected.label}.${kind}.theme does not match the manifest tuple`);
  if (!value.tuple || JSON.stringify(value.tuple) !== JSON.stringify(expected.tuple)) push(errors, `${expected.label}.${kind}.tuple does not match the manifest tuple`);
  if (value.privacyVerdict !== "verified") push(errors, `${expected.label}.${kind}.privacyVerdict must be verified`);
  if (kind === "genuineCapture") {
    requireHash(errors, value.captureSha256, SHA256, `${expected.label}.genuineCapture.captureSha256`);
    if (exists(root, expected.capturePath) && value.captureSha256 !== fileHash(root, expected.capturePath)) push(errors, `${expected.label}.genuineCapture.captureSha256 does not match capture bytes`);
    if (typeof value.format === "string") validateMediaFile(root, expected.capturePath, value.format, `${expected.label}.genuineCapture.capturePath`, errors);
    else push(errors, `${expected.label}.genuineCapture.format is required`);
  }
  if (kind === "recording") {
    requireHash(errors, value.recordingSha256, SHA256, `${expected.label}.recording.recordingSha256`);
    if (!Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0) push(errors, `${expected.label}.recording.durationSeconds must be positive`);
    if (!Number.isFinite(value.frameRate) || value.frameRate <= 0) push(errors, `${expected.label}.recording.frameRate must be positive`);
    if (value.format !== "webm") push(errors, `${expected.label}.recording.format must be webm`);
    const info = validateMediaFile(root, expected.recordingPath, "webm", `${expected.label}.recording.path`, errors);
    if (info && (!Number.isInteger(value.frameCount) || value.frameCount < info.frames)) push(errors, `${expected.label}.recording.frameCount does not prove media frame presence`);
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
  let interactionPackageSha256 = null;
  if (!interaction || typeof interaction !== "object") push(errors, `${label}.builtInteraction must be an object`);
  else {
    requirePath(errors, options.root, interaction.receiptPath, `${label}.builtInteraction.receiptPath`, options.checkFiles);
    requireText(errors, interaction.route, `${label}.builtInteraction.route`);
    requirePath(errors, options.root, interaction.packageContent, `${label}.builtInteraction.packageContent`, options.checkFiles);
    if (typeof interaction.route === "string" && !interaction.route.startsWith(FEATURE_INVENTORY.surfaces[surfaceName].routePrefix)) push(errors, `${label}.builtInteraction.route is outside its surface`);
    if (options.checkReceipts) {
      const receipt = parseEvidence(options.root, interaction.receiptPath, `${label}.builtInteraction.receiptPath`, errors);
      interactionPackageSha256 = receipt?.packageSha256 || null;
      validateEvidence(receipt, { label, route: interaction.route, packageContent: interaction.packageContent, implementationPath: implementation?.path, gitCommit: options.gitCommit, tuple: FEATURE_INVENTORY.surfaces[surfaceName].tuple, viewport: FEATURE_INVENTORY.surfaces[surfaceName].tuple.viewport, scale: FEATURE_INVENTORY.surfaces[surfaceName].tuple.scale, theme: FEATURE_INVENTORY.surfaces[surfaceName].tuple.theme }, "builtInteraction", options.root, errors);
      validatePackageEvidence(receipt?.package, { label }, options.retiredManifest, options.root, errors);
    }
  }
  const capture = surface.genuineCapture;
  if (!capture || typeof capture !== "object") push(errors, `${label}.genuineCapture must be an object`);
  else {
    requirePath(errors, options.root, capture.receiptPath, `${label}.genuineCapture.receiptPath`, options.checkFiles);
    requirePath(errors, options.root, capture.capturePath, `${label}.genuineCapture.capturePath`, options.checkFiles);
    if (options.checkReceipts) {
      const receipt = parseEvidence(options.root, capture.receiptPath, `${label}.genuineCapture.receiptPath`, errors);
      validateEvidence(receipt, { label, route: interaction?.route, packageContent: interaction?.packageContent, implementationPath: implementation?.path, gitCommit: options.gitCommit, capturePath: capture.capturePath, tuple: FEATURE_INVENTORY.surfaces[surfaceName].tuple, viewport: FEATURE_INVENTORY.surfaces[surfaceName].tuple.viewport, scale: FEATURE_INVENTORY.surfaces[surfaceName].tuple.scale, theme: FEATURE_INVENTORY.surfaces[surfaceName].tuple.theme }, "genuineCapture", options.root, errors);
    }
  }
  const recording = surface.recording;
  if (!recording || typeof recording !== "object" || typeof recording.required !== "boolean") push(errors, `${label}.recording must declare required`);
  else if (recording.required) {
    requirePath(errors, options.root, recording.receiptPath, `${label}.recording.receiptPath`, options.checkFiles);
    requirePath(errors, options.root, recording.path, `${label}.recording.path`, options.checkFiles);
    if (options.checkReceipts) validateEvidence(parseEvidence(options.root, recording.receiptPath, `${label}.recording.receiptPath`, errors), { label, route: interaction?.route, packageContent: interaction?.packageContent, implementationPath: implementation?.path, gitCommit: options.gitCommit, recordingPath: recording.path, tuple: FEATURE_INVENTORY.surfaces[surfaceName].tuple, viewport: FEATURE_INVENTORY.surfaces[surfaceName].tuple.viewport, scale: FEATURE_INVENTORY.surfaces[surfaceName].tuple.scale, theme: FEATURE_INVENTORY.surfaces[surfaceName].tuple.theme }, "recording", options.root, errors);
  } else if (recording.receiptPath !== null || recording.path !== null) push(errors, `${label}.recording must use null paths when not required`);
  const boundary = surface.dataBoundary;
  if (!boundary || typeof boundary !== "object") push(errors, `${label}.dataBoundary must be an object`);
  else { requireText(errors, boundary.statement, `${label}.dataBoundary.statement`); requirePath(errors, options.root, boundary.assertedBy, `${label}.dataBoundary.assertedBy`, options.checkFiles); if (options.checkReceipts) validatePrivacyEvidence(options.root, boundary.assertedBy, `${label}.dataBoundary.assertedBy`, { packageSha256: interactionPackageSha256, interactionId: `${surfaceName}:${feature.id}`, gitCommit: options.gitCommit }, errors); }
  const availability = surface.availability;
  if (!availability || typeof availability !== "object") push(errors, `${label}.availability must be an object`);
  else { requirePath(errors, options.root, availability.supported, `${label}.availability.supported`, options.checkFiles); requirePath(errors, options.root, availability.unavailable, `${label}.availability.unavailable`, options.checkFiles); if (options.checkReceipts) { validateAvailabilityEvidence(options.root, availability.supported, `${label}.availability.supported`, "supported", { packageSha256: interactionPackageSha256, interactionId: `${surfaceName}:${feature.id}`, gitCommit: options.gitCommit }, errors); validateAvailabilityEvidence(options.root, availability.unavailable, `${label}.availability.unavailable`, "unavailable", { packageSha256: interactionPackageSha256, interactionId: `${surfaceName}:${feature.id}`, gitCommit: options.gitCommit }, errors); } }
  const negative = surface.negativeCase;
  if (!negative || typeof negative !== "object") push(errors, `${label}.negativeCase must be an object`);
  else { requirePath(errors, options.root, negative.path, `${label}.negativeCase.path`, options.checkFiles); requireText(errors, negative.testName, `${label}.negativeCase.testName`); }
}
function validateInventory(inventory, options = {}) {
  const errors = [];
  const root = options.root || repoRoot;
  const checkFiles = options.checkFiles === true;
  const currentGitCommit = options.gitCommit === undefined ? gitCommit(root) : options.gitCommit;
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
      else validateSurface(feature[surfaceName], feature, surfaceName, { root, checkFiles, checkReceipts: options.checkReceipts === true, checkSourceSymbols: options.checkSourceSymbols === true, gitCommit: currentGitCommit, retiredManifest: options.retiredManifest }, errors);
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
        if (field === "visualDiff") validateVisualDiff(root, screen[field], `${screen.id}.visualDiff`, errors);
      }
      validateDesignAudit(root, screen.materialDesignAudit, `${screen.id}.materialDesignAudit`, errors);
      validateMediaFile(root, screen.rawReferenceCapture, path.extname(screen.rawReferenceCapture).slice(1).toLowerCase(), `${screen.id}.rawReferenceCapture`, errors);
      validateMediaFile(root, screen.rawBuiltCapture, path.extname(screen.rawBuiltCapture).slice(1).toLowerCase(), `${screen.id}.rawBuiltCapture`, errors);
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
  ["source-commit", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.builtInteraction.receiptPath); const r = readJson(p); r.sourceCommit = "0123456789abcdef0123456789abcdef01234567"; fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["localization", (root, inventory) => { fs.rmSync(absolute(root, inventory.features[0].desktop.localization.en.path)); }],
  ["article", (root, inventory) => { fs.rmSync(absolute(root, inventory.features[0].desktop.documentation.article)); }],
  ["test", (root, inventory) => { fs.rmSync(absolute(root, inventory.features[0].desktop.focusedTest.path)); }],
  ["interaction", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.builtInteraction.receiptPath); const r = readJson(p); r.route = "wrong-route"; fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["capture", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.genuineCapture.receiptPath); const r = readJson(p); r.captureSha256 = "f".repeat(64); fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["package-record", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.builtInteraction.receiptPath); const r = readJson(p); r.packageSha256 = "e".repeat(64); fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["package-signature", (root, inventory) => { const p = absolute(root, path.join(path.dirname(inventory.features[0].desktop.builtInteraction.packageContent), "Setup.exe")); fs.writeFileSync(p, Buffer.from("not-a-pe")); }],
  ["package-membership", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.builtInteraction.receiptPath); const r = readJson(p); r.package.packageMembership = ["missing.txt"]; fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["privacy", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.dataBoundary.assertedBy); fs.writeFileSync(p, JSON.stringify({ privacyVerdict: "unverified", boundaryType: "local-only", networkAccess: "none", redacted: false }), "utf8"); }],
  ["availability", (root, inventory) => { const p = absolute(root, inventory.features[0].desktop.availability.supported); fs.writeFileSync(p, JSON.stringify({ state: "unknown", reason: "fixture", recovery: "retry", verifiedAt: "2026-09-02T12:00:00Z" }), "utf8"); }],
  ["recording-metadata", (root, inventory) => { const p = absolute(root, inventory.features.find((item) => item.motionApplies).desktop.recording.receiptPath); const r = readJson(p); r.frameCount = 0; fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["provenance", (root, inventory) => { const p = absolute(root, inventory.versionProvenance.receiptPath); const r = readJson(p); r.updatedAt = "not-a-timestamp"; fs.writeFileSync(p, JSON.stringify(r), "utf8"); }],
  ["parity-tuple", (_root, _inventory, parity) => { parity.screens[0].scale = 9; }],
  ["parity-duplicate-tuple", (_root, _inventory, parity) => { parity.screens[1].language = parity.screens[0].language; parity.screens[1].theme = parity.screens[0].theme; parity.screens[1].state = parity.screens[0].state; parity.screens[1].time = parity.screens[0].time; parity.screens[1].motion = parity.screens[0].motion; }],
  ["parity-visual-diff", (root, _inventory, parity) => { fs.writeFileSync(absolute(root, parity.screens[0].visualDiff), "{}", "utf8"); }],
  ["parity-hash", (_root, _inventory, parity) => { parity.screens[0].builtCaptureSha256 = "a".repeat(64); }],
  ["retired-package-content", (root) => { const p = absolute(root, "packages/staged-package/package.cjs"); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, "const DEFAULT_ME = {};"); }]
]);
function makeFixtureRoot(inventory, parity, destination = null) {
  const root = destination || fs.mkdtempSync(path.join(os.tmpdir(), "claude-design-guards-"));
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" }); execFileSync("git", ["config", "user.name", "Fixture Builder"], { cwd: root, stdio: "ignore" }); execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root, stdio: "ignore" });
  const touch = (relative, body = "fixture") => { const p = absolute(root, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  const binary = (relative, bytes) => { const p = absolute(root, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); };
  const media = makeMediaFixtures();
  const write = (relative, value) => touch(relative, JSON.stringify(value));
  touch(inventory.versionProvenance.versionPath, JSON.stringify({ version: "1.0.0" }));
  touch(inventory.versionProvenance.updatedAtPath, "provenance");
  const now = "2026-09-02T12:00:00Z";
  touch("source-provenance.txt", "fixture source provenance"); execFileSync("git", ["add", "source-provenance.txt"], { cwd: root, stdio: "ignore" }); execFileSync("git", ["commit", "-q", "--no-verify", "-m", "fixture"], { cwd: root, stdio: "ignore" });
  const fixtureCommit = gitCommit(root);
  write(inventory.versionProvenance.receiptPath, { version: "1.0.0", updatedAt: now, timezone: "UTC", sourceSha256: fixtureCommit, packageSha256: fileHash(root, inventory.versionProvenance.updatedAtPath) });
  for (const feature of inventory.features) for (const kind of ["desktop","site"]) {
    const surface = feature[kind]; const source = `// fixture\nfunction ${surface.implementation.symbol}() {}\n${surface.implementation.registration}\n`;
    touch(surface.implementation.path, source); touch(surface.documentation.article, `# ${surface.documentation.heading}`);
    for (const locale of Object.values(surface.localization)) touch(locale.path, "{}");
    touch(surface.persistence.path, "export const state = {};");
    touch(surface.focusedTest.path, "test(\"fixture\", () => {});");
    touch(surface.builtInteraction.packageContent, "package");
    const packageDir = path.dirname(surface.builtInteraction.packageContent);
    const packageFiles = { setupExe: `${packageDir}/Setup.exe`, releases: `${packageDir}/RELEASES`, fullNupkg: `${packageDir}/full.nupkg`, deltaNupkg: [`${packageDir}/delta.nupkg`], asar: `${packageDir}/app.asar`, packageMembership: ["package.json"], nupkgMembership: ["package.json"], deltaNupkgMembership: [["package.json"]], asarMembership: ["package.json"] };
    const asarBytes = makeAsarFixture(); const packageJson = Buffer.from("{}", "utf8");
    binary(packageFiles.setupExe, makePeFixture()); binary(packageFiles.fullNupkg, makeZip([["package.json", packageJson], ["app.asar", asarBytes]])); binary(packageFiles.deltaNupkg[0], makeZip([["package.json", packageJson]])); touch(packageFiles.releases, "hash full.nupkg 1\nhash delta.nupkg 1\n"); binary(packageFiles.asar, asarBytes);
    const base = { sourceSha256: sourceHash(Buffer.from(source)), sourceCommit: fixtureCommit, packageSha256: fileHash(root, surface.builtInteraction.packageContent), route: surface.builtInteraction.route, tuple: FEATURE_INVENTORY.surfaces[kind].tuple, viewport: FEATURE_INVENTORY.surfaces[kind].tuple.viewport, scale: 1, theme: "light", privacyVerdict: "verified", package: packageFiles };
    write(surface.builtInteraction.receiptPath, base);
    const format = kind === "desktop" ? "png" : "webp";
    const captureBytes = media[format];
    binary(surface.genuineCapture.capturePath, captureBytes);
    write(surface.genuineCapture.receiptPath, { ...base, format, captureSha256: crypto.createHash("sha256").update(captureBytes).digest("hex") });
    if (surface.recording.required) { const recordingBytes = media.webm; binary(surface.recording.path, recordingBytes); write(surface.recording.receiptPath, { ...base, format: "webm", recordingSha256: fileHash(root, surface.recording.path), frameCount: 2, durationSeconds: 1, frameRate: 30 }); }
    const privacy = { privacyVerdict: "verified", boundaryType: "local-only", networkAccess: "none", networkRequests: 0, noNetworkProof: "verified-no-network", redacted: true, sourceCommit: fixtureCommit, packageSha256: base.packageSha256, interactionId: `${kind}:${feature.id}` };
    touch(surface.dataBoundary.assertedBy, JSON.stringify(privacy));
    touch(surface.availability.supported, JSON.stringify({ state: "supported", reason: "fixture support", recovery: "continue", verifiedAt: now, sourceCommit: fixtureCommit, packageSha256: base.packageSha256, interactionId: `${kind}:${feature.id}` }));
    touch(surface.availability.unavailable, JSON.stringify({ state: "unavailable", reason: "fixture unavailable", recovery: "use the documented fallback", verifiedAt: now, sourceCommit: fixtureCommit, packageSha256: base.packageSha256, interactionId: `${kind}:${feature.id}` }));
    touch(surface.negativeCase.path, "export {};");
  }
  for (const screen of parity.screens) {
    touch(screen.referenceFile, "<!doctype html>");
    touch(screen.materialDesignAudit, JSON.stringify({ designSystem: "Material Design 3", primitives: "verified", controls: "verified", accessibility: "verified" }));
    const parityPng = media.png;
    binary(screen.rawReferenceCapture, parityPng); binary(screen.rawBuiltCapture, parityPng); binary(screen.sideBySide, parityPng);
    touch(screen.visualDiff, JSON.stringify({ referenceSha256: fileHash(root, screen.rawReferenceCapture), builtSha256: fileHash(root, screen.rawBuiltCapture), changedPixels: 0, threshold: 0, verdict: "identical" }));
  }
  // The fixture Git repository intentionally tracks only its provenance seed.
  // The evidence files remain untracked test inputs, while their receipts bind
  // to the real ancestor commit and to the bytes read from those files.
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
  const baselineErrors = validateInventory(baselineInventory, { root, checkFiles: true, checkReceipts: true, checkSourceSymbols: true, retiredManifest: readJson(path.join(scriptDir, "retired-runtime-patterns.json")) });
  if (baselineErrors.length) throw new Error(`fixture inventory baseline is invalid: ${baselineErrors.slice(0, 20).join("; ")}`);
  if (validateDesignParity(baselineParity, { root, checkFiles: true, checkTupleCoverage: false }).length) throw new Error("fixture design parity baseline is invalid");
  for (const [name, mutate] of mutationCases) {
    const inventory = clone(baselineInventory); const parity = clone(baselineParity);
    const before = JSON.stringify({ inventory, parity, files: fixtureFingerprint(root) });
    mutate(root, inventory, parity);
    const after = JSON.stringify({ inventory, parity, files: fixtureFingerprint(root) });
    if (before === after) throw new Error(`mutation did not land: ${name}`);
    const errors = name.startsWith("parity-") ? validateDesignParity(parity, { root, checkFiles: true, checkTupleCoverage: false }) : name === "retired-package-content" ? validateRetiredRuntime(readJson(path.join(scriptDir, "retired-runtime-patterns.json")), { root, scanFiles: true }) : validateInventory(inventory, { root, checkFiles: true, checkReceipts: true, checkSourceSymbols: true, retiredManifest: readJson(path.join(scriptDir, "retired-runtime-patterns.json")) });
    if (errors.length === 0) throw new Error(`negative self-test did not turn red: ${name}`);
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    makeFixtureRoot(baselineInventory, baselineParity, root);
    const restoredErrors = validateInventory(baselineInventory, { root, checkFiles: true, checkReceipts: true, checkSourceSymbols: true, retiredManifest: readJson(path.join(scriptDir, "retired-runtime-patterns.json")) });
    if (restoredErrors.length !== 0) throw new Error(`negative self-test did not restore green: ${name}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`SELF-TEST PASS: ${mutationCases.filter(([name]) => name !== "retired-package-content").length} fixture mutation cases, 2 parity cases, 1 retired-package case (red then green).`);
}
function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) { runSelfTests(); return; }
  const shapeOnly = args.has("--shape-only");
  const indexErrors = validateIndexManifest(readJson(path.join(scriptDir, "completeness-inventory.json")));
  const retiredManifest = readJson(path.join(scriptDir, "retired-runtime-patterns.json"));
  const inventoryErrors = validateInventory(FEATURE_INVENTORY, { root: repoRoot, checkFiles: !shapeOnly, checkReceipts: !shapeOnly, checkSourceSymbols: !shapeOnly, retiredManifest });
  const parityErrors = validateDesignParity(DESIGN_PARITY_INVENTORY, { root: repoRoot, checkFiles: !shapeOnly, checkTupleCoverage: !shapeOnly });
  const retiredErrors = validateRetiredRuntime(retiredManifest, { root: repoRoot, scanFiles: !shapeOnly });
  const all = [...indexErrors.map((x) => `COMPLETENESS_INDEX: ${x}`), ...inventoryErrors.map((x) => `COMPLETENESS: ${x}`), ...parityErrors.map((x) => `DESIGN_PARITY: ${x}`), ...retiredErrors.map((x) => `RETIRED_RUNTIME: ${x}`)];
  if (all.length) { console.error(`FAIL: ${all.length} completeness/parity/runtime findings.`); for (const error of all.slice(0, 160)) console.error(` - ${error}`); if (all.length > 160) console.error(` - ... ${all.length - 160} more findings`); process.exitCode = 1; }
  else console.log("PASS: completeness inventory, design parity inventory, and retired runtime scan are green.");
}
if (process.argv[1]?.endsWith("check-completeness.mjs")) main();
