import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const distDir = path.join(root, "dist");
export const desktopDistDir = distDir;
export const siteDistDir = path.join(distDir, "site");
const desktopSource = path.join(root, "apps", "desktop", "src");
const siteSource = path.join(root, "apps", "site", "src");
const docsSource = path.join(root, "docs");
const codexPackage = path.join(root, "node_modules", "@openai", "codex-win32-x64");
const codexVendor = path.join(codexPackage, "vendor", "x86_64-pc-windows-msvc");
const codexIntegrity = "sha512-B8h0/2Kt+rKQv2+vqBhlhWkMEdhf4dsn46FNKMEBTXj3YC5hwSioOcTX2hMgJxMEMtKIMH6Ire1eNrQPvaL9og==";

function requiredFile(file, label) {
  if (!existsSync(file)) throw new Error(`${label} is missing: ${path.relative(root, file)}`);
  return file;
}

function ensure(directory) {
  mkdirSync(directory, { recursive: true });
}

export function cleanDist() {
  rmSync(distDir, { recursive: true, force: true });
  ensure(desktopDistDir);
  ensure(siteDistDir);
}

export function copyStaticAssets() {
  const source = path.join(root, "apps", "desktop", "assets");
  if (existsSync(source)) cpSync(source, path.join(desktopDistDir, "assets"), { recursive: true });
}

export function copyDocumentation() {
  const destination = path.join(siteDistDir, "docs");
  if (!existsSync(docsSource)) return;
  for (const entry of readdirSync(docsSource, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    cpSync(path.join(docsSource, entry.name), path.join(destination, entry.name), { recursive: true });
  }
}

export function copyCodexRuntime() {
  requiredFile(path.join(codexPackage, "package.json"), "@openai/codex-win32-x64 package");
  const executable = requiredFile(path.join(codexVendor, "bin", "codex.exe"), "Codex Windows x64 executable");
  const destination = path.join(distDir, "resources", "codex");
  rmSync(destination, { recursive: true, force: true });
  ensure(destination);
  cpSync(codexVendor, destination, { recursive: true });
  const packageJson = JSON.parse(readFileSync(path.join(codexPackage, "package.json"), "utf8"));
  if (packageJson.version !== "0.152.1-win32-x64") throw new Error(`Unexpected Codex native package version: ${packageJson.version}`);
  const lockPath = path.join(root, "package-lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const lockEntry = lock.packages?.["node_modules/@openai/codex-win32-x64"];
    if (!lockEntry || lockEntry.integrity !== codexIntegrity) throw new Error("package-lock.json does not pin @openai/codex-win32-x64 with the required integrity.");
  }
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push({ path: path.relative(destination, full).replaceAll("\\", "/"), sha256: hashFile(full), bytes: statSync(full).size });
    }
  }
  walk(destination);
  runCodexContract(executable, destination);
  files.length = 0;
  const collectGenerated = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (full.endsWith("runtime-manifest.json")) continue;
      if (entry.isDirectory()) collectGenerated(full);
      else files.push({ path: path.relative(destination, full).replaceAll("\\", "/"), sha256: hashFile(full), bytes: statSync(full).size });
    }
  };
  collectGenerated(destination);
  writeFileSync(path.join(destination, "runtime-manifest.json"), `${JSON.stringify({ schemaVersion: 1, package: "@openai/codex-win32-x64", version: packageJson.version, platform: "win32-x64", files }, null, 2)}\n`, "utf8");
}

function runCodexContract(executable, destination) {
  const commands = [
    ["app-server", "--help"],
    ["app-server", "generate-ts", "--out", path.join(destination, "schemas", "ts")],
    ["app-server", "generate-json-schema", "--out", path.join(destination, "schemas", "json")]
  ];
  for (const args of commands) {
    const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    if (result.error) throw new Error(`Codex runtime ${args.join(" ")} failed to start: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`Codex runtime ${args.join(" ")} exited with code ${result.status}: ${(result.stderr || result.stdout || "").trim()}`);
  }
  const metadataFile = path.join(root, "packages", "contracts", "generated", "schema-metadata.json");
  if (existsSync(metadataFile)) {
    const metadata = JSON.parse(readFileSync(metadataFile, "utf8"));
    if (metadata.runtimeVersion !== "0.152.1" || metadata.platform !== "win32-x64") throw new Error("Committed app-server schema metadata does not match @openai/codex 0.152.1 win32-x64.");
  }
}

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export async function buildDesktop({ mode = "production" } = {}) {
  const main = requiredFile(path.join(desktopSource, "main.ts"), "desktop main entry");
  const preload = requiredFile(path.join(desktopSource, "preload.ts"), "desktop preload entry");
  const renderer = requiredFile(path.join(desktopSource, "renderer.tsx"), "desktop renderer entry");
  await esbuild.build({ absWorkingDir: root, bundle: true, entryPoints: { main, preload }, external: ["electron"], format: "cjs", legalComments: "none", minify: mode === "production", outdir: desktopDistDir, outExtension: { ".js": ".cjs" }, platform: "node", sourcemap: mode !== "production", target: "node22" });
  await esbuild.build({ absWorkingDir: root, bundle: true, entryPoints: [renderer], format: "esm", jsx: "automatic", legalComments: "none", minify: mode === "production", outfile: path.join(desktopDistDir, "renderer.js"), platform: "browser", sourcemap: mode !== "production", target: "chrome120" });
}

export async function buildSite({ mode = "production" } = {}) {
  const entry = path.join(siteSource, "main.tsx");
  if (!existsSync(entry)) {
    const fallback = requiredFile(path.join(root, "site", "app.js"), "public site entry or apps/site/src/main.tsx");
    cpSync(fallback, path.join(siteDistDir, "site.js"));
    return;
  }
  await esbuild.build({ absWorkingDir: root, bundle: true, entryPoints: [entry], format: "esm", jsx: "automatic", legalComments: "none", minify: mode === "production", outfile: path.join(siteDistDir, "site.js"), platform: "browser", sourcemap: mode !== "production", target: "chrome120" });
}

export function verifyBuildOutputs() {
  for (const output of [path.join(desktopDistDir, "main.cjs"), path.join(desktopDistDir, "preload.cjs"), path.join(desktopDistDir, "renderer.js")]) requiredFile(output, "desktop build output");
  requiredFile(path.join(siteDistDir, "site.js"), "public site build output");
}
