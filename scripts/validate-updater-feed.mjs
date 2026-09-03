import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const contract = JSON.parse(await readFile(`${root}/release-support/updater-contract.json`, "utf8"));
if (contract.feedProtocol !== "squirrel-windows" || contract.feedTransport !== "https") {
  throw new Error("Updater contract must use the HTTPS Squirrel.Windows feed.");
}
if (contract.signatureRequired !== false || contract.hashRequired !== true) {
  throw new Error("Updater contract must require package hashes and explicitly keep signatures disabled.");
}
if (!contract.identity?.appId || !contract.identity?.productName) throw new Error("Updater identity is incomplete.");
for (const action of ["Restart to install update", "Later", "Check for updates"]) {
  if (!contract.userActions.includes(action)) throw new Error(`Updater action is missing: ${action}`);
}
console.log(`Updater contract verified for ${contract.identity.productName} (${contract.identity.appId}).`);
