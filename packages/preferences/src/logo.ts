import type { LogoBackground, LogoCrop, LogoFit, LogoSettings } from "./types.js";

export const MAX_LOGO_BYTES = 8 * 1024 * 1024;
export const MAX_LOGO_PIXELS = 16_000_000;
export const MAX_LOGO_DIMENSION = 8_192;

export type LogoMime = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

export interface LogoSource {
  bytes: Uint8Array;
  name: string;
  claimedMime?: string;
}
export interface LogoValidation {
  ok: boolean;
  mime: LogoMime | null;
  width: number | null;
  height: number | null;
  animated: boolean;
  errors: string[];
}

export interface LogoConversionPlan {
  mime: LogoMime;
  sizes: number[];
  fit: LogoFit;
  crop: LogoCrop | null;
  focalPoint: { x: number; y: number };
  background: LogoBackground;
}

export interface DecodedLogo {
  width: number;
  height: number;
  image: unknown;
}

export interface LogoDecoder {
  decode(bytes: Uint8Array, mime: LogoMime): Promise<DecodedLogo>;
  encode(image: unknown, size: number, background: LogoBackground): Promise<Uint8Array>;
}

export function validateLogoSource(source: LogoSource): LogoValidation {
  const errors: string[] = [];
  const bytes = source.bytes;
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) errors.push("byte-limit");
  const mime = detectLogoMime(bytes);
  if (!mime) errors.push("unsupported-signature");
  let width: number | null = null;
  let height: number | null = null;
  if (mime === "image/png") {
    if (bytes.byteLength < 24) errors.push("truncated-png");
    else {
      width = readU32(bytes, 16);
      height = readU32(bytes, 20);
    }
  } else if (mime === "image/svg+xml") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!/<svg(?:\s|>)/i.test(text) || /<script(?:\s|>)/i.test(text) || /<iframe(?:\s|>)/i.test(text) || /@import/i.test(text) || /url\(\s*["']?(?:https?:|data:|\/\/)/i.test(text) || /(?:href|src)\s*=\s*["'](?:https?:|data:|\/\/)/i.test(text)) errors.push("unsafe-svg");
  } else if (mime === "image/webp") {
    const text = new TextDecoder("latin1").decode(bytes);
    if (text.includes("ANIM")) errors.push("animated-image");
    const vp8x = bytes.findIndex((value, index) => value === 0x56 && bytes[index + 1] === 0x50 && bytes[index + 2] === 0x38 && bytes[index + 3] === 0x58);
    if (vp8x >= 0 && bytes.length >= vp8x + 14) {
      width = 1 + ((bytes[vp8x + 8] ?? 0) | (bytes[vp8x + 9] ?? 0) << 8 | (bytes[vp8x + 10] ?? 0) << 16);
      height = 1 + ((bytes[vp8x + 11] ?? 0) | (bytes[vp8x + 12] ?? 0) << 8 | (bytes[vp8x + 13] ?? 0) << 16);
    }
  }
  if ((width !== null && (width < 1 || width > MAX_LOGO_DIMENSION)) || (height !== null && (height < 1 || height > MAX_LOGO_DIMENSION))) errors.push("dimension-limit");
  if (width !== null && height !== null && width * height > MAX_LOGO_PIXELS) errors.push("pixel-limit");
  if (source.claimedMime && mime && source.claimedMime !== mime) errors.push("mime-mismatch");
  return { ok: errors.length === 0, mime, width, height, animated: errors.includes("animated-image"), errors };
}

function detectLogoMime(bytes: Uint8Array): LogoMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  const prefix = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 512)).replace(/^\uFEFF/, "").trimStart();
  if (/<svg(?:\s|>)/i.test(prefix)) return "image/svg+xml";
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) * 2 ** 24 + (bytes[offset + 1] ?? 0) * 2 ** 16 + (bytes[offset + 2] ?? 0) * 256 + (bytes[offset + 3] ?? 0);
}

export function createLogoConversionPlan(validation: LogoValidation, settings: Pick<LogoSettings, "fit" | "crop" | "focalPoint" | "background" | "derivedSizes">): LogoConversionPlan {
  if (!validation.ok || !validation.mime) throw new Error(`logo-source-invalid:${validation.errors.join(",")}`);
  const sizes = [...new Set<number>(settings.derivedSizes.filter((size): size is number => Number.isInteger(size) && size >= 16 && size <= 2048))].sort((a, b) => a - b);
  if (!sizes.length) throw new Error("logo-size-list-empty");
  if (settings.focalPoint.x < 0 || settings.focalPoint.x > 1 || settings.focalPoint.y < 0 || settings.focalPoint.y > 1) throw new Error("focal-point-out-of-range");
  return { mime: validation.mime, sizes, fit: settings.fit, crop: settings.crop, focalPoint: settings.focalPoint, background: settings.background };
}

export async function decodeAndConvertLogo(source: LogoSource, plan: LogoConversionPlan, decoder: LogoDecoder): Promise<{ outputs: Array<{ size: number; bytes: Uint8Array; mime: "image/png" }>; decoded: DecodedLogo }> {
  const validation = validateLogoSource(source);
  if (!validation.ok || validation.mime !== plan.mime) throw new Error(`logo-decode-refused:${validation.errors.join(",")}`);
  const decoded = await decoder.decode(source.bytes, validation.mime);
  if (!Number.isInteger(decoded.width) || !Number.isInteger(decoded.height) || decoded.width < 1 || decoded.height < 1 || decoded.width > MAX_LOGO_DIMENSION || decoded.height > MAX_LOGO_DIMENSION || decoded.width * decoded.height > MAX_LOGO_PIXELS) throw new Error("decoded-logo-out-of-bounds");
  const outputs: Array<{ size: number; bytes: Uint8Array; mime: "image/png" }> = [];
  for (const size of plan.sizes) {
    const bytes = await decoder.encode(decoded.image, size, plan.background);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) throw new Error("encoded-logo-out-of-bounds");
    const outputValidation = validateLogoSource({ bytes, name: `logo-${size}.png`, claimedMime: "image/png" });
    if (!outputValidation.ok || outputValidation.mime !== "image/png") throw new Error(`encoded-logo-invalid:${size}`);
    const roundTrip = await decoder.decode(bytes, "image/png");
    if (roundTrip.width !== size || roundTrip.height !== size) throw new Error(`encoded-logo-round-trip-mismatch:${size}`);
    outputs.push({ size, bytes, mime: "image/png" });
  }
  return { outputs, decoded };
}

export function createBrowserLogoDecoder(): LogoDecoder {
  return {
    async decode(bytes, mime) {
      if (typeof globalThis.createImageBitmap !== "function") throw new Error("image-decoder-unavailable");
      const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: mime });
      const image = await globalThis.createImageBitmap(blob);
      return { width: image.width, height: image.height, image };
    },
    async encode(image, size, background) {
      if (typeof OffscreenCanvas === "undefined") throw new Error("image-encoder-unavailable");
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("image-context-unavailable");
      if (background.kind === "solid") { context.fillStyle = background.color; context.fillRect(0, 0, size, size); }
      context.drawImage(image as CanvasImageSource, 0, 0, size, size);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await blob.arrayBuffer());
    }
  };
}

export interface LogoStore {
  get(): LogoSettings;
  applyAsync(source: LogoSource, settings: Pick<LogoSettings, "fit" | "crop" | "focalPoint" | "background" | "derivedSizes">, decoder: LogoDecoder): Promise<{ settings: LogoSettings; validation: LogoValidation; plan: LogoConversionPlan; outputs: Array<{ size: number; bytes: Uint8Array; mime: "image/png" }> }>;
  reset(): void;
}

export function createLogoStore(initial: LogoSettings, onPersist: (settings: LogoSettings) => void): LogoStore {
  let current = { ...initial, background: { ...initial.background }, focalPoint: { ...initial.focalPoint }, derivedSizes: [...initial.derivedSizes] };
  const clone = () => ({ ...current, background: { ...current.background }, focalPoint: { ...current.focalPoint }, derivedSizes: [...current.derivedSizes] });
  return {
    get: clone,
    async applyAsync(source, settings, decoder) {
      const validation = validateLogoSource(source);
      if (!validation.ok) throw new Error(`logo-conversion-refused:${validation.errors.join(",")}`);
      const plan = createLogoConversionPlan(validation, settings);
      const converted = await decodeAndConvertLogo(source, plan, decoder);
      const previous = clone();
      try {
        current = { ...current, presetId: null, sourceName: null, sourceMime: validation.mime, fit: plan.fit, crop: plan.crop, focalPoint: { ...plan.focalPoint }, background: { ...plan.background }, derivedSizes: plan.sizes };
        onPersist(clone());
      } catch (error) {
        current = previous;
        try { onPersist(clone()); } catch { /* Keep the previous valid logo active. */ }
        throw error;
      }
      return { settings: clone(), validation, plan, outputs: converted.outputs };
    },
    reset() {
      current = { ...initial, background: { ...initial.background }, focalPoint: { ...initial.focalPoint }, derivedSizes: [...initial.derivedSizes] };
      onPersist(clone());
    }
  };
}
