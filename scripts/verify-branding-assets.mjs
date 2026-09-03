import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'assets/branding/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const selfTest = process.argv.includes('--self-test');
const fail = (message) => { throw new Error(message); };

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});
const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const paeth = (left, above, upperLeft) => {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
};

const decodePng = (bytes, label) => {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(pngSignature)) fail(`${label}: invalid PNG signature`);
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idat = [];
  const seen = new Map();
  let sawIhdr = false;
  let sawIend = false;
  while (offset + 12 <= bytes.length) {
    const chunkStart = offset;
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (!/^[A-Za-z]{4}$/.test(type)) fail(`${label}: invalid chunk type`);
    if (end + 4 > bytes.length) fail(`${label}: truncated ${type} chunk`);
    const data = bytes.subarray(start, end);
    const storedCrc = bytes.readUInt32BE(end);
    const computedCrc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    if (storedCrc !== computedCrc) fail(`${label}: CRC mismatch in ${type} chunk`);
    seen.set(type, (seen.get(type) ?? 0) + 1);
    if (type === 'IHDR') {
      if (sawIhdr || chunkStart !== 8 || length !== 13) fail(`${label}: IHDR must be first and unique`);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (!width || !height) fail(`${label}: empty dimensions`);
      sawIhdr = true;
    } else if (!sawIhdr) fail(`${label}: ${type} precedes IHDR`);
    if (type === 'IDAT') {
      if (sawIend) fail(`${label}: IDAT follows IEND`);
      idat.push(data);
    } else if (type === 'IEND') {
      if (sawIend || !idat.length || length !== 0) fail(`${label}: IEND must be unique and follow IDAT`);
      sawIend = true;
      offset = end + 4;
      if (offset !== bytes.length) fail(`${label}: trailing bytes after IEND`);
      break;
    } else if (sawIend) fail(`${label}: chunk follows IEND`);
    offset = end + 4;
  }
  if (!sawIend || !sawIhdr || !idat.length) fail(`${label}: incomplete PNG`);
  if (seen.get('IHDR') !== 1 || seen.get('IEND') !== 1) fail(`${label}: critical chunk uniqueness violation`);
  if (![2, 6].includes(colorType) || bitDepth !== 8) fail(`${label}: expected 8-bit RGB or RGBA PNG`);
  const scanlines = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  if (scanlines.length !== (rowBytes + 1) * height) fail(`${label}: decoded scanline length mismatch`);
  const rows = [];
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[sourceOffset];
    const source = scanlines.subarray(sourceOffset + 1, sourceOffset + 1 + rowBytes);
    const row = Buffer.alloc(rowBytes);
    if (![0, 1, 2, 3, 4].includes(filter)) fail(`${label}: unsupported PNG filter ${filter}`);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const above = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
      row[x] = (source[x] + predictor) & 0xff;
    }
    rows.push(row);
    for (let x = 0; x < width; x += 1) {
      const from = x * bytesPerPixel;
      const to = (y * width + x) * 4;
      pixels[to] = row[from];
      pixels[to + 1] = row[from + 1];
      pixels[to + 2] = row[from + 2];
      pixels[to + 3] = bytesPerPixel === 4 ? row[from + 3] : 255;
    }
    previous = row;
    sourceOffset += rowBytes + 1;
  }
  const alpha = colorType === 6 && rows.some((row) => {
    for (let x = 3; x < row.length; x += 4) if (row[x] !== 255) return true;
    return false;
  });
  return { width, height, alpha, pixels };
};

const decodeIco = (bytes, label) => {
  if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) fail(`${label}: invalid ICO header`);
  const count = bytes.readUInt16LE(4);
  if (count < 1 || bytes.length < 6 + count * 16) fail(`${label}: invalid ICO directory`);
  const sizes = [];
  const seen = new Set();
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    const width = bytes[at] || 256;
    const height = bytes[at + 1] || 256;
    const length = bytes.readUInt32LE(at + 8);
    const imageOffset = bytes.readUInt32LE(at + 12);
    if (width !== height || seen.has(width)) fail(`${label}: duplicate or non-square directory size at entry ${i}`);
    if (!length || imageOffset < 6 + count * 16 || imageOffset + length > bytes.length) fail(`${label}: invalid image entry ${i}`);
    seen.add(width);
    sizes.push(width);
    const payload = bytes.subarray(imageOffset, imageOffset + length);
    if (!payload.subarray(0, 8).equals(pngSignature)) fail(`${label}: entry ${i} is not an embedded PNG`);
    const decoded = decodePng(payload, `${label} entry ${i}`);
    if (decoded.width !== width || decoded.height !== height) fail(`${label}: embedded dimensions mismatch at entry ${i}`);
  }
  return { width: 256, height: 256, alpha: true, sizes };
};

const equalHash = (actual, expected, label) => {
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail(`${label}: SHA-256 mismatch, got ${actual}`);
};

const resizePixels = (source, width, height) => {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width));
    const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
    const from = (sourceY * source.width + sourceX) * 4;
    const to = (y * width + x) * 4;
    source.pixels.copy(pixels, to, from, from + 4);
  }
  return { width, height, pixels };
};

const compositePixels = (backdrop, overlay, x, y) => {
  const pixels = Buffer.from(backdrop.pixels);
  if (x < 0 || y < 0 || x + overlay.width > backdrop.width || y + overlay.height > backdrop.height) fail('canonical placement exceeds backdrop');
  const base = pixels.subarray(0, 3);
  for (let oy = 0; oy < overlay.height; oy += 1) for (let ox = 0; ox < overlay.width; ox += 1) pixels.set(base, ((y + oy) * backdrop.width + x + ox) * 4);
  for (let oy = 0; oy < overlay.height; oy += 1) for (let ox = 0; ox < overlay.width; ox += 1) {
    const from = (oy * overlay.width + ox) * 4;
    const to = ((y + oy) * backdrop.width + x + ox) * 4;
    const alpha = overlay.pixels[from + 3] / 255;
    if (alpha === 1) pixels.set(overlay.pixels.subarray(from, from + 3), to);
    else if (alpha > 0) for (let channel = 0; channel < 3; channel += 1) pixels[to + channel] = Math.round(overlay.pixels[from + channel] * alpha + pixels[to + channel] * (1 - alpha));
  }
  return pixels;
};

const assertPlacement = (actual, backdrop, canonical, placement) => {
  const expected = compositePixels(backdrop, resizePixels(canonical, placement.width, placement.height), placement.x, placement.y);
  for (let y = placement.y; y < placement.y + placement.height; y += 1) for (let x = placement.x; x < placement.x + placement.width; x += 1) {
    const at = (y * backdrop.width + x) * 4;
    for (let channel = 0; channel < 4; channel += 1) if (actual[at + channel] !== expected[at + channel]) fail(`canonical placement pixel mismatch at ${x},${y}`);
  }
};

const checked = [];
const decodedByPath = new Map();
const records = [manifest.assets.logoMaster, manifest.assets.socialPreviewBackdrop, manifest.assets.socialPreviewMaster, ...manifest.assets.socialPreviewCopies, ...manifest.assets.derivedDisplayAssets];
for (const record of records) {
  const path = resolve(root, record.path);
  const bytes = await readFile(path);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  equalHash(actualHash, record.sha256, record.path);
  const decoded = record.format === 'PNG' ? decodePng(bytes, record.path) : decodeIco(bytes, record.path);
  if (decoded.width !== record.dimensions.width || decoded.height !== record.dimensions.height) fail(`${record.path}: dimensions differ from manifest`);
  if (record.alpha.includes('non-opaque') && !decoded.alpha) fail(`${record.path}: manifest requires non-opaque alpha`);
  if (record.alpha === 'none' && decoded.alpha) fail(`${record.path}: manifest requires no alpha`);
  decodedByPath.set(record.path, decoded);
  checked.push({ path: record.path, sha256: actualHash, dimensions: `${decoded.width}x${decoded.height}`, alpha: decoded.alpha });
}

const master = await readFile(resolve(root, manifest.assets.socialPreviewMaster.path));
for (const copy of manifest.assets.socialPreviewCopies) {
  const bytes = await readFile(resolve(root, copy.path));
  if (!master.equals(bytes)) fail(`${copy.path}: not byte-identical to ${manifest.assets.socialPreviewMaster.path}`);
}

const placement = manifest.assets.canonicalPlacement.destination;
const masterDecoded = decodedByPath.get(manifest.assets.socialPreviewMaster.path);
const backdropDecoded = decodedByPath.get(manifest.assets.socialPreviewBackdrop.path);
const canonicalDecoded = decodedByPath.get(manifest.assets.logoMaster.path);
assertPlacement(masterDecoded.pixels, backdropDecoded, canonicalDecoded, placement);

const ico = manifest.assets.derivedDisplayAssets.find((record) => record.format === 'ICO');
const icoInfo = decodeIco(await readFile(resolve(root, ico.path)), ico.path);
for (const expectedSize of ico.sizes) if (!icoInfo.sizes.includes(expectedSize)) fail(`${ico.path}: missing ${expectedSize}px entry`);

let trailingByteRegression = 'not-run';
let placementPixelRegression = 'not-run';
let crcRegression = 'not-run';
let icoDimensionRegression = 'not-run';
if (selfTest) {
  const logoBytes = await readFile(resolve(root, manifest.assets.logoMaster.path));
  try {
    decodePng(Buffer.concat([logoBytes, Buffer.from([0])]), 'self-test trailing-byte mutation');
    fail('self-test trailing-byte mutation was accepted');
  } catch (error) {
    if (!String(error.message).includes('trailing bytes after IEND')) throw error;
    trailingByteRegression = 'red-then-green';
  }
  const mutated = Buffer.from(masterDecoded.pixels);
  const mutationAt = (placement.y * masterDecoded.width + placement.x) * 4;
  mutated[mutationAt] ^= 1;
  try {
    assertPlacement(mutated, backdropDecoded, canonicalDecoded, placement);
    fail('self-test placement pixel mutation was accepted');
  } catch (error) {
    if (!String(error.message).includes('canonical placement pixel mismatch')) throw error;
    placementPixelRegression = 'red-then-green';
  }
  const crcMutation = Buffer.from(logoBytes);
  crcMutation[16] ^= 1;
  try {
    decodePng(crcMutation, 'self-test CRC mutation');
    fail('self-test CRC mutation was accepted');
  } catch (error) {
    if (!String(error.message).includes('CRC mismatch')) throw error;
    crcRegression = 'red-then-green';
  }
  const icoBytes = await readFile(resolve(root, ico.path));
  const icoDimensionMutation = Buffer.from(icoBytes);
  icoDimensionMutation[6] = 17;
  icoDimensionMutation[7] = 17;
  try {
    decodeIco(icoDimensionMutation, 'self-test ICO dimension mutation');
    fail('self-test ICO dimension mutation was accepted');
  } catch (error) {
    if (!String(error.message).includes('embedded dimensions mismatch')) throw error;
    icoDimensionRegression = 'red-then-green';
  }
}

console.log(JSON.stringify({ ok: true, checked, identicalWideCopies: true, icoSizes: icoInfo.sizes, canonicalPlacement: placement, trailingByteRegression, placementPixelRegression, crcRegression, icoDimensionRegression }, null, 2));
