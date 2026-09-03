import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Data, NtExecutable, NtExecutableResource, Resource } from "resedit";

const require = createRequire(import.meta.url);
const { applyApplicationIcon } = require("../build/after-pack.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function iconBytes(item) {
  return Buffer.from(item.isRaw() ? item.bin : item.generate());
}

function iconSize(item) {
  if (item.isRaw()) return [item.width === 0 ? 256 : item.width, item.height === 0 ? 256 : item.height];
  return [item.width ?? item.bitmapInfo.width, item.height ?? Math.abs(item.bitmapInfo.height / 2)];
}

function fingerprint(item) {
  const [width, height] = iconSize(item);
  const bytes = iconBytes(item);
  return `${width}x${height}:${bytes.length}:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function verifyExecutableIcon(executablePath, iconPath) {
  const source = Data.IconFile.from(await readFile(iconPath));
  const executable = NtExecutable.from(await readFile(executablePath));
  const resources = NtExecutableResource.from(executable);
  const group = Resource.IconGroupEntry.fromEntries(resources.entries).find((entry) => entry.id === 1) ?? Resource.IconGroupEntry.fromEntries(resources.entries)[0];
  if (!group) throw new Error("The packaged executable has no icon group.");
  const expected = source.icons.map((entry) => fingerprint(entry.data)).sort();
  const actual = group.getIconItemsFromEntries(resources.entries).map(fingerprint).sort();
  if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) throw new Error(`The packaged executable icon does not match the committed icon container. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  return { sizes: source.icons.map((entry) => iconSize(entry.data)[0]).sort((a, b) => a - b) };
}

async function selfTest() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "claude-design-branding-"));
  const probe = path.join(temporary, "probe.exe");
  const sourceExecutable = path.join(root, "node_modules", "electron", "dist", "electron.exe");
  const icon = path.join(root, "assets", "branding", "app-icon.ico");
  try {
    await copyFile(sourceExecutable, probe);
    let negativeTurnedRed = false;
    try { await verifyExecutableIcon(probe, icon); } catch { negativeTurnedRed = true; }
    if (!negativeTurnedRed) throw new Error("The default Electron icon unexpectedly satisfied the product icon check.");
    await applyApplicationIcon(probe, icon);
    const verified = await verifyExecutableIcon(probe, icon);
    console.log(JSON.stringify({ ok: true, negativeRegression: "red-then-green", ...verified }, null, 2));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--self-test") await selfTest();
else {
  const executable = process.argv[2];
  const icon = process.argv[3];
  if (!executable || !icon) throw new Error("Usage: node scripts/verify-windows-branding.mjs <executable> <icon>");
  console.log(JSON.stringify({ ok: true, ...(await verifyExecutableIcon(path.resolve(executable), path.resolve(icon))) }, null, 2));
}
