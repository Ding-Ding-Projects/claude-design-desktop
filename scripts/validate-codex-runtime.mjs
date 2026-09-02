import { readFile } from "node:fs/promises";

const contract = JSON.parse(await readFile("release-support/codex-runtime-contract.json", "utf8"));
const manifest = JSON.parse(await readFile("release-support/dependency-manifest.json", "utf8"));
const pin = manifest.npmPackages.find((entry) => entry.name === contract.package);
if (!pin || pin.version !== contract.version || !pin.integrity.startsWith("sha512-")) {
  throw new Error(`Codex runtime pin must be ${contract.package}@${contract.version} with npm integrity.`);
}
if (contract.platform !== "win32-x64" || contract.binary !== "codex.exe" || contract.transport !== "stdio-jsonl") {
  throw new Error("Codex runtime contract must target the bundled Windows x64 binary over stdio JSONL.");
}
for (const command of ["app-server", "generate-ts", "generate-json-schema"]) {
  if (!contract.requiredCommands.includes(command)) throw new Error(`Codex runtime command is missing: ${command}`);
}
if (!contract.generatedSchemaDirectoryCandidates.length) throw new Error("Generated app-server schema paths are not declared.");
console.log(`Codex runtime contract verified for ${contract.package}@${contract.version} on ${contract.platform}.`);
