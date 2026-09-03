import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fail = (message) => { throw new Error(message); };
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
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
const chunk = (type, data) => {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
};
const paeth = (left, above, upperLeft) => {
  const estimate = left + above - upperLeft;
  const a = Math.abs(estimate - left); const b = Math.abs(estimate - above); const c = Math.abs(estimate - upperLeft);
  return a <= b && a <= c ? left : b <= c ? above : upperLeft;
};
const decodePng = (bytes, label) => {
  if (!bytes.subarray(0, 8).equals(signature)) fail(`${label}: invalid PNG signature`);
  let offset = 8; let width = 0; let height = 0; let channels = 0; let idat = []; let sawIend = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8; const end = start + length;
    if (end + 4 > bytes.length) fail(`${label}: truncated ${type}`);
    const data = bytes.subarray(start, end);
    if (bytes.readUInt32BE(end) !== crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]))) fail(`${label}: CRC mismatch in ${type}`);
    if (type === 'IHDR') {
      if (offset !== 8 || width) fail(`${label}: invalid IHDR`);
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0 || ![2, 6].includes(data[9])) fail(`${label}: unsupported PNG format`);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') {
      if (length !== 0 || sawIend || end + 4 !== bytes.length) fail(`${label}: invalid IEND`);
      sawIend = true; offset = end + 4; break;
    }
    offset = end + 4;
  }
  if (!sawIend || !width || !height || !idat.length) fail(`${label}: incomplete PNG`);
  const rowBytes = width * channels; const packed = inflateSync(Buffer.concat(idat));
  if (packed.length !== (rowBytes + 1) * height) fail(`${label}: decoded length mismatch`);
  const pixels = Buffer.alloc(width * height * 4); let packedOffset = 0; let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filter = packed[packedOffset]; const source = packed.subarray(packedOffset + 1, packedOffset + 1 + rowBytes); const row = Buffer.alloc(rowBytes);
    if (![0, 1, 2, 3, 4].includes(filter)) fail(`${label}: unsupported filter ${filter}`);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= channels ? row[x - channels] : 0; const above = previous[x]; const upperLeft = x >= channels ? previous[x - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
      row[x] = (source[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const from = x * channels; const to = (y * width + x) * 4;
      pixels[to] = row[from]; pixels[to + 1] = row[from + 1]; pixels[to + 2] = row[from + 2]; pixels[to + 3] = channels === 4 ? row[from + 3] : 255;
    }
    previous = row; packedOffset += rowBytes + 1;
  }
  return { width, height, pixels };
};
const encodePng = ({ width, height, pixels }) => {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) { raw[y * (width * 4 + 1)] = 0; pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
};
const resize = (source, width, height) => {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width)); const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
    source.pixels.copy(pixels, (y * width + x) * 4, (sourceY * source.width + sourceX) * 4, (sourceY * source.width + sourceX + 1) * 4);
  }
  return { width, height, pixels };
};
const alphaComposite = (backdrop, mark, x, y) => {
  if (x < 0 || y < 0 || x + mark.width > backdrop.width || y + mark.height > backdrop.height) fail('placement exceeds backdrop');
  const base = backdrop.pixels.subarray(0, 3);
  for (let my = 0; my < mark.height; my += 1) for (let mx = 0; mx < mark.width; mx += 1) backdrop.pixels.set(base, ((y + my) * backdrop.width + x + mx) * 4);
  for (let my = 0; my < mark.height; my += 1) for (let mx = 0; mx < mark.width; mx += 1) {
    const source = (my * mark.width + mx) * 4; const target = ((y + my) * backdrop.width + x + mx) * 4; const alpha = mark.pixels[source + 3] / 255;
    if (alpha === 1) backdrop.pixels.set(mark.pixels.subarray(source, source + 3), target);
    else if (alpha > 0) for (let channel = 0; channel < 3; channel += 1) backdrop.pixels[target + channel] = Math.round(mark.pixels[source + channel] * alpha + backdrop.pixels[target + channel] * (1 - alpha));
  }
};
const [canonicalPath, backdropPath] = process.argv.slice(2);
if (!canonicalPath || !backdropPath) fail('usage: node scripts/compose-social-preview.mjs <canonical-png> <backdrop-png>');
const canonical = decodePng(await readFile(canonicalPath), 'canonical input');
const backdrop = decodePng(await readFile(backdropPath), 'backdrop input');
const placement = { x: 32, y: 24, width: 840, height: 840 };
const mark = resize(canonical, placement.width, placement.height);
alphaComposite(backdrop, mark, placement.x, placement.y);
const output = resolve(root, 'assets/branding/social-preview-master.png');
await writeFile(output, encodePng(backdrop));
await writeFile(resolve(root, 'social-preview.png'), encodePng(backdrop));
await writeFile(resolve(root, 'site/social-preview.png'), encodePng(backdrop));
console.log(JSON.stringify({ output: 'assets/branding/social-preview-master.png', placement, sourceDimensions: [canonical.width, canonical.height], outputDimensions: [backdrop.width, backdrop.height] }, null, 2));
