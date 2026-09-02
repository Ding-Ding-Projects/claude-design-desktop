import type { AppearanceValue } from "./types.js";

export const RAINBOW_SENTINEL = "__RAINBOW__" as const;
export type ColorSpace = "hex" | "rgb" | "hsl" | "hsv" | "hwb" | "lab" | "lch" | "oklab" | "oklch" | "cmyk";
export interface ColorValue { space: ColorSpace; channels: readonly number[]; alpha: number; }
export interface AppearanceState { values: Record<string, AppearanceValue>; rainbowSpeed: 1 | 2 | 3 | 4 | 5; reducedMotion: boolean; }

export const DEFAULT_APPEARANCE: AppearanceState = { values: {}, rainbowSpeed: 3, reducedMotion: false };
export function isRainbow(value: AppearanceValue | undefined): boolean { return value?.kind === "rainbow" && value.value === RAINBOW_SENTINEL; }
export function setAppearance(state: AppearanceState, elementId: string, value: AppearanceValue): AppearanceState { return { ...state, values: { ...state.values, [elementId]: value } }; }
export function rainbowCss(state: AppearanceState): string { if (state.reducedMotion) return "oklch(0.72 0.18 0)"; return `linear-gradient(90deg, oklch(0.72 0.18 0), oklch(0.72 0.18 120), oklch(0.72 0.18 240), oklch(0.72 0.18 360)) ${Math.max(2, 12 - state.rainbowSpeed * 2)}s linear infinite`; }

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
export function colorTranslationCapability(source: ColorSpace, target: ColorSpace): { supported: boolean; reason: string } {
  return source === target ? { supported: true, reason: "No conversion required" } : { supported: false, reason: `Conversion ${source} to ${target} requires the owning color adapter` };
}
export function colorContrast(foreground: ColorValue, background: ColorValue): { ratio: number; aa: boolean; aaa: boolean } {
  const luminance = (value: ColorValue) => { const values = value.channels.slice(0, 3).map(channel => clamp(channel / 100, 0, 1)); return 0.2126 * (values[0] ?? 0) + 0.7152 * (values[1] ?? 0) + 0.0722 * (values[2] ?? 0); };
  const a = luminance(foreground), b = luminance(background), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return { ratio, aa: ratio >= 4.5, aaa: ratio >= 7 };
}
