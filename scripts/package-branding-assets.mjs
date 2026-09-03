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
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
};

const decodePng = (bytes, label) => {
  if (!bytes.subarray(0, 8).equals(signature)) fail(`${label}: invalid PNG signature`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  let interlace = 0;
  const idat = [];
  let iend = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) fail(`${label}: truncated ${type}`);
    const data = bytes.subarray(start, end);
    if (bytes.readUInt32BE(end) !== crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]))) fail(`${label}: CRC mismatch in ${type}`);
    if (type === 'IHDR') {
      if (offset !== 8 || width) fail(`${label}: invalid IHDR ordering`);
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') {
      if (iend || length !== 0 || end + 4 !== bytes.length) fail(`${label}: invalid IEND`);
      iend = true; offset = end + 4; break;
    }
    offset = end + 4;
  }
  if (!iend || !width || !height || !idat.length || bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) fail(`${label}: unsupported PNG shape`);
  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  const packed = inflateSync(Buffer.concat(idat));
  if (packed.length !== (rowBytes + 1) * height) fail(`${label}: decoded length mismatch`);
  const pixels = Buffer.alloc(width * height * 4);
  let packedOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filter = packed[packedOffset];
    const source = packed.subarray(packedOffset + 1, packedOffset + 1 + rowBytes);
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const above = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      const estimate = left + above - upperLeft;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : (() => {
        const a = Math.abs(estimate - left); const b = Math.abs(estimate - above); const c = Math.abs(estimate - upperLeft);
        return a <= b && a <= c ? left : b <= c ? above : upperLeft;
      })();
      if (![0, 1, 2, 3, 4].includes(filter)) fail(`${label}: unsupported filter ${filter}`);
      row[x] = (source[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = x * channels;
      const pixelOffset = (y * width + x) * 4;
      pixels[pixelOffset] = row[sourceOffset]; pixels[pixelOffset + 1] = row[sourceOffset + 1]; pixels[pixelOffset + 2] = row[sourceOffset + 2]; pixels[pixelOffset + 3] = channels === 4 ? row[sourceOffset + 3] : 255;
    }
    previous = row;
    packedOffset += rowBytes + 1;
  }
  return { width, height, pixels };
};

const encodePng = ({ width, height, pixels }) => {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
};

const resize = (source, width, height) => {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width));
    const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
    source.pixels.copy(pixels, (y * width + x) * 4, (sourceY * source.width + sourceX) * 4, (sourceY * source.width + sourceX + 1) * 4);
  }
  return { width, height, pixels };
};

const makeIco = (entries) => {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + directory.length;
  const payloads = [];
  entries.forEach((entry, index) => {
    const payload = encodePng(entry);
    const at = index * 16;
    directory[at] = entry.width === 256 ? 0 : entry.width;
    directory[at + 1] = entry.height === 256 ? 0 : entry.height;
    directory[at + 2] = 0; directory[at + 3] = 0;
    directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(payload.length, at + 8); directory.writeUInt32LE(offset, at + 12);
    payloads.push(payload); offset += payload.length;
  });
  return Buffer.concat([header, directory, ...payloads]);
};

const [canonicalPath, tinyPath] = process.argv.slice(2);
if (!canonicalPath || !tinyPath) fail('usage: node scripts/package-branding-assets.mjs <canonical-png> <tiny-source-png>');
const canonical = decodePng(await readFile(canonicalPath), 'canonical input');
const tiny = decodePng(await readFile(tinyPath), 'tiny input');
const output = resolve(root, 'assets/branding');
const entries = new Map();
const tiny16 = resize(tiny, 16, 16);
entries.set(16, tiny16);
await writeFile(resolve(output, 'logo-16-source.png'), encodePng(tiny16));
await writeFile(resolve(output, 'logo-16.png'), encodePng(tiny16));
for (const size of [24, 32, 48, 64, 128, 256]) {
  const resized = resize(canonical, size, size);
  entries.set(size, resized);
  await writeFile(resolve(output, `logo-${size}.png`), encodePng(resized));
}
await writeFile(resolve(output, 'app-icon.ico'), makeIco([16, 24, 32, 48, 64, 128, 256].map((size) => entries.get(size))));
console.log(JSON.stringify({ converter: 'deterministic Node PNG decoder and encoder, nearest-neighbor resize, PNG-in-ICO packaging', sizes: [...entries.keys()] }, null, 2));
