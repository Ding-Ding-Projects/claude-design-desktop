import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { CODEX_PACKAGE_VERSION } from "./config.js";
import { APP_SERVER_SCHEMA_ADAPTER } from "./protocol-schema.js";

export const BUNDLED_CODEX_RELATIVE_PATH = join("codex", `${CODEX_PACKAGE_VERSION}-win32-x64`, "codex.exe");
export const BUNDLED_CODEX_MANIFEST_RELATIVE_PATH = join("codex", `${CODEX_PACKAGE_VERSION}-win32-x64`, "manifest.json");
export interface BundledRuntimeMetadata { executablePath: string; sha256: string; packageVersion: string; platform: "win32-x64"; schemaAdapterVersion: string; }

export async function resolveBundledRuntime(resourcesRoot: string): Promise<BundledRuntimeMetadata> {
  if (!isAbsolute(resourcesRoot)) throw new Error("Bundled resources root must be absolute");
  const root = resolve(resourcesRoot);
  const executablePath = resolve(root, BUNDLED_CODEX_RELATIVE_PATH);
  const manifestPath = resolve(root, BUNDLED_CODEX_MANIFEST_RELATIVE_PATH);
  if (!executablePath.startsWith(`${root}${sep}`) || !manifestPath.startsWith(`${root}${sep}`)) throw new Error("Bundled runtime escaped resources");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Partial<BundledRuntimeMetadata>;
  if (manifest.packageVersion !== CODEX_PACKAGE_VERSION || manifest.platform !== "win32-x64" || manifest.schemaAdapterVersion !== APP_SERVER_SCHEMA_ADAPTER.adapterVersion || typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error("Bundled runtime manifest is incompatible");
  await access(executablePath, constants.X_OK);
  const sha256 = createHash("sha256").update(await readFile(executablePath)).digest("hex");
  if (sha256.toLowerCase() !== manifest.sha256.toLowerCase()) throw new Error("Bundled runtime digest mismatch");
  return { executablePath, sha256, packageVersion: CODEX_PACKAGE_VERSION, platform: "win32-x64", schemaAdapterVersion: APP_SERVER_SCHEMA_ADAPTER.adapterVersion };
}

const SAFE_ENVIRONMENT_KEYS = ["ALLUSERSPROFILE", "APPDATA", "ComSpec", "CommonProgramFiles", "CommonProgramFiles(x86)", "HOMEDRIVE", "HOMEPATH", "LANG", "LC_ALL", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS", "OS", "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "PROCESSOR_LEVEL", "PROCESSOR_REVISION", "PROGRAMDATA", "ProgramFiles", "ProgramFiles(x86)", "PUBLIC", "SystemDrive", "SystemRoot", "TEMP", "TMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "windir"] as const;
export function createSafeChildEnvironment(source: NodeJS.ProcessEnv | undefined, codexHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) { const value = source?.[key] ?? process.env[key]; if (value !== undefined) env[key] = value; }
  env.CODEX_HOME = codexHome;
  return env;
}
