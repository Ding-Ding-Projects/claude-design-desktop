const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { Data, NtExecutable, NtExecutableResource, Resource } = require("resedit");

async function applyApplicationIcon(executablePath, iconPath) {
  const executable = NtExecutable.from(await readFile(executablePath));
  const resources = NtExecutableResource.from(executable);
  const existingGroups = Resource.IconGroupEntry.fromEntries(resources.entries);
  const existing = existingGroups.find((entry) => entry.id === 1) ?? existingGroups[0];
  const groupId = existing?.id ?? 1;
  const language = existing?.lang ?? 0x0409;
  const iconFile = Data.IconFile.from(await readFile(iconPath));
  if (iconFile.icons.length === 0) throw new Error("The application icon contains no images.");
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, groupId, language, iconFile.icons.map((entry) => entry.data));
  resources.outputResource(executable);
  await writeFile(executablePath, Buffer.from(executable.generate()));
}

async function afterPack(context) {
  if (context.electronPlatformName !== "win32") throw new Error("Claude Design Desktop packages only the Windows target.");
  const executablePath = path.join(context.appOutDir, "Claude Design Desktop.exe");
  const iconPath = path.join(context.packager.projectDir, "assets", "branding", "app-icon.ico");
  await applyApplicationIcon(executablePath, iconPath);
}

module.exports = afterPack;
module.exports.applyApplicationIcon = applyApplicationIcon;
