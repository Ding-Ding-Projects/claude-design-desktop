import type { LogoBackground, LogoCrop, LogoFit, LogoSettings } from "./types";

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
    if (!/<svg(?:\s|>)/i.test(text) || /<script(?:\s|>)/i.test(text) || /(?:href|src)\s*=\s*["'](?:https?:|data:|\/\/)/i.test(text)) errors.push("unsafe-svg");
  } else if (mime === "image/webp") {
    const text = new TextDecoder("latin1").decode(bytes);
    if (text.includes("ANIM")) errors.push("animated-image");
    const vp8x = bytes.findIndex((value, index) => value === 0x56 && bytes[index + 1] === 0x50 && bytes[index + 2] === 0x38 && bytes[index + 3] === 0x58);
    if (vp8x >= 0 && bytes.length >= vp8x + 14) {
      width = 1 + (bytes[vp8x + 8] | bytes[vp8x + 9] << 8 | bytes[vp8x + 10] << 16);
      height = 1 + (bytes[vp8x + 11] | bytes[vp8x + 12] << 8 | bytes[vp8x + 13] << 16);
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
  return bytes[offset] * 2 ** 24 + bytes[offset + 1] * 2 ** 16 + bytes[offset + 2] * 256 + bytes[offset + 3];
}

export function createLogoConversionPlan(validation: LogoValidation, settings: Pick<LogoSettings, "fit" | "crop" | "focalPoint" | "background" | "derivedSizes">): LogoConversionPlan {
  if (!validation.ok || !validation.mime) throw new Error(`logo-source-invalid:${validation.errors.join(",")}`);
  const sizes = [...new Set(settings.derivedSizes.filter((size) => Number.isInteger(size) && size >= 16 && size <= 2048))].sort((a, b) => a - b);
  if (!sizes.length) throw new Error("logo-size-list-empty");
  if (settings.focalPoint.x < 0 || settings.focalPoint.x > 1 || settings.focalPoint.y < 0 || settings.focalPoint.y > 1) throw new Error("focal-point-out-of-range");
  return { mime: validation.mime, sizes, fit: settings.fit, crop: settings.crop, focalPoint: settings.focalPoint, background: settings.background };
}

export interface LogoStore {
  get(): LogoSettings;
  apply(source: LogoSource, settings: Pick<LogoSettings, "fit" | "crop" | "focalPoint" | "background" | "derivedSizes">): { settings: LogoSettings; validation: LogoValidation; plan: LogoConversionPlan };
  reset(): void;
}

export function createLogoStore(initial: LogoSettings, onPersist: (settings: LogoSettings) => void): LogoStore {
  let current = { ...initial, background: { ...initial.background }, focalPoint: { ...initial.focalPoint }, derivedSizes: [...initial.derivedSizes] };
  const clone = () => ({ ...current, background: { ...current.background }, focalPoint: { ...current.focalPoint }, derivedSizes: [...current.derivedSizes] });
  return {
    get: clone,
    apply(source, settings) {
      const validation = validateLogoSource(source);
      if (!validation.ok) throw new Error(`logo-conversion-refused:${validation.errors.join(",")}`);
      const plan = createLogoConversionPlan(validation, settings);
      const previous = clone();
      try {
        current = { ...current, presetId: null, sourceName: source.name, sourceMime: validation.mime, fit: plan.fit, crop: plan.crop, focalPoint: { ...plan.focalPoint }, background: { ...plan.background }, derivedSizes: plan.sizes };
        onPersist(clone());
      } catch (error) {
        current = previous;
        try { onPersist(clone()); } catch { /* Keep the in-memory prior valid logo active. */ }
        throw error;
      }
      return { settings: clone(), validation, plan };
    },
    reset() {
      current = { ...initial, background: { ...initial.background }, focalPoint: { ...initial.focalPoint }, derivedSizes: [...initial.derivedSizes] };
      onPersist(clone());
    }
  };
}
