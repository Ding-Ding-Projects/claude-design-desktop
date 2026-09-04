import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, "claude-design-download-companion.zip");
const files = [
  "extension/background.js",
  "extension/icon.svg",
  "extension/native-response.js",
  "extension/options.html",
  "extension/popup.css",
  "extension/popup.html",
  "extension/popup.js",
  "manifest.json",
  "native-host/README.md",
  "native-host/protocol.schema.json",
  "native-host/windows/com.claude.design.downloads.json.template",
  "native-host/windows/register-user.ps1.template"
].sort();

const entries = [];
for (const name of files) entries.push({ name, data: await readFile(path.join(root, name)) });
const zip = createZip(entries);
await writeFile(output, zip);
assertArchiveMatches(zip, entries);
console.log(`Wrote deterministic ZIP with ${entries.length} entries: ${output}`);

function createZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.data.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, entry.data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(entry.data.length, 20);
    directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + entry.data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

function assertArchiveMatches(zip, entries) {
  const expected = entries.map((entry) => entry.name);
  const actual = [];
  let cursor = 0;
  while (cursor < zip.length) {
    const signature = zip.readUInt32LE(cursor);
    if (signature === 0x04034b50) {
      const nameLength = zip.readUInt16LE(cursor + 26);
      const dataLength = zip.readUInt32LE(cursor + 18);
      const name = zip.subarray(cursor + 30, cursor + 30 + nameLength).toString("utf8");
      const dataStart = cursor + 30 + nameLength;
      actual.push(name);
      const source = entries.find((entry) => entry.name === name);
      if (!source || !zip.subarray(dataStart, dataStart + dataLength).equals(source.data)) throw new Error(`ZIP content differs from unpacked source: ${name}`);
      cursor = dataStart + dataLength;
      continue;
    }
    if (signature === 0x02014b50) {
      cursor += 46 + zip.readUInt16LE(cursor + 28);
      continue;
    }
    if (signature === 0x06054b50) break;
    throw new Error("Unexpected ZIP record");
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("ZIP entry list differs from unpacked source");
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
