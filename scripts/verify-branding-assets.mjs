import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'assets/branding/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const fail = (message) => { throw new Error(message); };

const decodePng = (bytes, label) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature)) fail(`${label}: invalid PNG signature`);
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idat = [];
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) fail(`${label}: truncated ${type} chunk`);
    const data = bytes.subarray(start, end);
    if (type === 'IHDR') {
      if (length !== 13) fail(`${label}: invalid IHDR length`);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (!width || !height) fail(`${label}: empty dimensions`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { sawEnd = true; break; }
    offset = end + 4;
  }
  if (!sawEnd || width === undefined || idat.length === 0) fail(`${label}: incomplete PNG`);
  if (![2, 6].includes(colorType) || bitDepth !== 8) fail(`${label}: expected 8-bit RGB or RGBA PNG`);
  const scanlines = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  if (scanlines.length !== (rowBytes + 1) * height) fail(`${label}: decoded scanline length mismatch`);
  return { width, height, alpha: colorType === 6 };
};

const decodeIco = (bytes, label) => {
  if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) fail(`${label}: invalid ICO header`);
  const count = bytes.readUInt16LE(4);
  if (count < 1 || bytes.length < 6 + count * 16) fail(`${label}: invalid ICO directory`);
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    const w = bytes[at] || 256;
    const h = bytes[at + 1] || 256;
    const length = bytes.readUInt32LE(at + 8);
    const imageOffset = bytes.readUInt32LE(at + 12);
    if (!length || imageOffset + length > bytes.length) fail(`${label}: invalid image entry ${i}`);
    sizes.push(w === h ? w : `${w}x${h}`);
    const payload = bytes.subarray(imageOffset, imageOffset + length);
    if (payload.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) decodePng(payload, `${label} entry ${i}`);
    else if (payload.subarray(0, 2).equals(Buffer.from([0, 0]))) fail(`${label}: unsupported embedded image ${i}`);
  }
  return { width: 256, height: 256, alpha: true, sizes };
};

const equalHash = (actual, expected, label) => {
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail(`${label}: SHA-256 mismatch, got ${actual}`);
};

const checked = [];
const records = [manifest.assets.logoMaster, manifest.assets.socialPreviewMaster, ...manifest.assets.socialPreviewCopies, ...manifest.assets.derivedDisplayAssets];
for (const record of records) {
  const path = resolve(root, record.path);
  const bytes = await readFile(path);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  equalHash(actualHash, record.sha256, record.path);
  const decoded = record.format === 'PNG' ? decodePng(bytes, record.path) : decodeIco(bytes, record.path);
  if (decoded.width !== record.dimensions.width || decoded.height !== record.dimensions.height) fail(`${record.path}: dimensions differ from manifest`);
  checked.push({ path: record.path, sha256: actualHash, dimensions: `${decoded.width}x${decoded.height}` });
}

const master = await readFile(resolve(root, manifest.assets.socialPreviewMaster.path));
for (const copy of manifest.assets.socialPreviewCopies) {
  const bytes = await readFile(resolve(root, copy.path));
  if (!master.equals(bytes)) fail(`${copy.path}: not byte-identical to ${manifest.assets.socialPreviewMaster.path}`);
}

const ico = manifest.assets.derivedDisplayAssets.find((record) => record.format === 'ICO');
const icoInfo = decodeIco(await readFile(resolve(root, ico.path)), ico.path);
for (const expectedSize of ico.sizes) if (!icoInfo.sizes.includes(expectedSize)) fail(`${ico.path}: missing ${expectedSize}px entry`);
console.log(JSON.stringify({ ok: true, checked, identicalWideCopies: true, icoSizes: icoInfo.sizes }, null, 2));
