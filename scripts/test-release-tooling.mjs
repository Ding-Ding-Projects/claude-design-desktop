import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("release-support/dependency-manifest.json", "utf8"));
const installer = JSON.parse(await readFile("release-support/installer-contract.json", "utf8"));
const updater = JSON.parse(await readFile("release-support/updater-contract.json", "utf8"));
const codex = JSON.parse(await readFile("release-support/codex-runtime-contract.json", "utf8"));
const workflow = await readFile(".github/workflows/release.yml", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.node.version === "22.14.0", "Node bootstrap is not pinned to the declared version.");
assert(/^[a-f0-9]{64}$/.test(manifest.node.sha256), "Node bootstrap lacks a SHA-256 digest.");
assert(manifest.npmPackages.some((entry) => entry.name === "@openai/codex" && entry.version === "0.152.1"), "Codex runtime pin is missing.");
assert(manifest.npmPackages.every((entry) => entry.integrity.startsWith("sha512-")), "Each npm package pin must carry npm integrity.");
assert(installer.appId === "com.dingdingprojects.claudedesigndesktop", "Installer app identity drifted.");
assert(installer.installerFormat === "squirrel-windows", "Installer format is not Squirrel.Windows.");
assert(installer.codeSigning === "prohibited", "Installer contract permits signing.");
assert(updater.feedTransport === "https" && updater.hashRequired === true && updater.signatureRequired === false, "Updater contract does not match the unsigned HTTPS feed policy.");
assert(codex.package === "@openai/codex" && codex.version === "0.152.1" && codex.platform === "win32-x64", "Codex runtime contract drifted.");
assert(codex.transport === "stdio-jsonl" && codex.requiredCommands.includes("generate-json-schema"), "Codex app-server protocol contract is incomplete.");
assert(/push:\s*\n\s*workflow_dispatch:/m.test(workflow), "Release workflow is not triggered by push and workflow_dispatch.");
assert(!/^\s+- name:.*\b(test|lint|type-?check|coverage|screenshot)\b/im.test(workflow), "Release workflow contains a prohibited validation step.");
assert(!/forceCodeSigning\s*:\s*true|sign(AndEdit)?Executable\s*:\s*true/i.test(workflow), "Release workflow enables code signing.");
assert(/gh release create/.test(workflow) && /gh release edit/.test(workflow), "Release workflow does not create and finalize one published release.");
console.log("Release tooling contract checks passed.");
