import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const requireFromRoot = createRequire(resolve(root, "package.json"));
let electronPackage;
try {
  electronPackage = dirname(requireFromRoot.resolve("electron/package.json"));
} catch {
  throw new Error("Root Electron 42.3.3 is missing. Install the root package dependency once, then rerun the reference launcher.");
}
const electronCli = resolve(electronPackage, "cli.js");
const child = spawn(process.execPath, [electronCli, resolve(here, "main.mjs"), ...process.argv.slice(2)], { cwd: root, stdio: "inherit", windowsHide: true });
child.once("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
