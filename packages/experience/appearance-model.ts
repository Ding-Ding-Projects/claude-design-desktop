import type { AppearanceLayer, AppearancePreset, ColorRepresentations, ElementAppearance, TypographySettings } from "./types";

export const APPEARANCE_STATES = ["normal", "hover", "focus", "pressed", "selected", "disabled", "dragged", "validation", "loading", "success", "warning", "error"] as const;

const defaultTypography: TypographySettings = {
  family: "System UI",
  sizePx: 14,
  weight: 400,
  style: "normal",
  underline: "none",
  strike: "none",
  overline: false,
  letterSpacingPx: 0,
  wordSpacingPx: 0,
  lineHeight: 1.4,
  baselineOffsetPx: 0,
  textColor: "#1D1B20",
  highlightColor: "transparent",
  textTransform: "none",
  direction: "ltr",
  alignment: "start"
};

const defaultColor: ColorRepresentations = {
  hex: "#6750A4",
  rgba: "rgba(103, 80, 164, 1)",
  hsl: "hsl(262, 34%, 48%)",
  hsv: "hsv(262, 51%, 64%)",
  hwb: "hwb(262 31% 36%)",
  lab: "lab(38% 35  -45)",
  lch: "lch(38% 57 308)",
  oklab: "oklab(57% 0.08 -0.12)",
  oklch: "oklch(57% 0.14 308)",
  cmyk: "cmyk(37%, 51%, 0%, 36%)",
  gamut: "srgb",
  contrastRatio: 6.1
};

export function createAppearance(elementId: string, overrides: Partial<ElementAppearance> = {}): ElementAppearance {
  const base: ElementAppearance = {
    elementId,
    properties: { opacity: 1, radius: 12, elevation: 1, motion: "standard", background: "#FFFBFE" },
    stateOverrides: Object.fromEntries(APPEARANCE_STATES.slice(1).map((state) => [state, {}])),
    layers: [{ id: "base", name: "Base", visible: true, locked: false, opacity: 1, blendMode: "normal", properties: {} }],
    typography: { ...defaultTypography },
    color: { ...defaultColor },
    history: [],
    historyIndex: -1,
    ...overrides
  };
  return recordAppearance(base, "Created appearance");
}

export function setAppearanceProperty(state: ElementAppearance, property: string, value: unknown, stateName = "normal"): ElementAppearance {
  const next = cloneAppearance(state);
  if (stateName === "normal") next.properties[property] = value;
  else next.stateOverrides[stateName] = { ...(next.stateOverrides[stateName] || {}), [property]: value };
  return recordAppearance(next, `Changed ${property}${stateName === "normal" ? "" : ` in ${stateName}`}`);
}

export function setTypography(state: ElementAppearance, changes: Partial<TypographySettings>): ElementAppearance {
  return recordAppearance({ ...cloneAppearance(state), typography: { ...state.typography, ...changes } }, "Changed typography");
}

export function setColor(state: ElementAppearance, color: ElementAppearance["color"]): ElementAppearance {
  return recordAppearance({ ...cloneAppearance(state), color }, "Changed color");
}

export function addLayer(state: ElementAppearance, layer: Partial<AppearanceLayer> = {}): ElementAppearance {
  const nextLayer: AppearanceLayer = {
    id: layer.id || `layer-${state.layers.length + 1}`,
    name: layer.name || `Layer ${state.layers.length + 1}`,
    visible: layer.visible ?? true,
    locked: layer.locked ?? false,
    opacity: layer.opacity ?? 1,
    blendMode: layer.blendMode || "normal",
    properties: layer.properties || {}
  };
  return recordAppearance({ ...cloneAppearance(state), layers: [...state.layers, nextLayer] }, `Added ${nextLayer.name}`);
}

export function updateLayer(state: ElementAppearance, layerId: string, changes: Partial<AppearanceLayer>): ElementAppearance {
  const layers = state.layers.map((layer) => layer.id === layerId ? { ...layer, ...changes } : layer);
  return recordAppearance({ ...cloneAppearance(state), layers }, `Updated layer ${layerId}`);
}

export function resetAppearance(state: ElementAppearance, scope: "property" | "state" | "element" | "global", property?: string, stateName = "normal"): ElementAppearance {
  const next = cloneAppearance(state);
  if (scope === "property" && property) delete next.properties[property];
  if (scope === "state") next.stateOverrides[stateName] = {};
  if (scope === "element" || scope === "global") return recordAppearance(createAppearance(state.elementId), `Reset ${scope} appearance`);
  return recordAppearance(next, `Reset ${scope}${property ? ` ${property}` : ""}`);
}

export function undoAppearance(state: ElementAppearance): ElementAppearance {
  if (state.historyIndex <= 0) return state;
  const snapshot = state.history[state.historyIndex - 1];
  return { ...JSON.parse(snapshot.snapshot) as ElementAppearance, history: state.history, historyIndex: state.historyIndex - 1 };
}

export function redoAppearance(state: ElementAppearance): ElementAppearance {
  if (state.historyIndex >= state.history.length - 1) return state;
  const snapshot = state.history[state.historyIndex + 1];
  return { ...JSON.parse(snapshot.snapshot) as ElementAppearance, history: state.history, historyIndex: state.historyIndex + 1 };
}

export function createPreset(id: string, name: string, description: string, state: ElementAppearance): AppearancePreset {
  return { id, name, description, appearance: cloneAppearance(state) };
}

export function serializeAppearance(state: ElementAppearance): string {
  return JSON.stringify({ schemaVersion: 1, appearance: state });
}

export function deserializeAppearance(serialized: string, elementId: string): ElementAppearance {
  const value: unknown = JSON.parse(serialized);
  if (!value || typeof value !== "object" || (value as { schemaVersion?: number }).schemaVersion !== 1) throw new Error("Unsupported appearance schema");
  const appearance = (value as { appearance?: ElementAppearance }).appearance;
  if (!appearance || appearance.elementId !== elementId || !Array.isArray(appearance.layers)) throw new Error("Invalid appearance payload");
  return createAppearance(elementId, appearance);
}

export function saveAppearance(storage: Pick<Storage, "setItem">, key: string, state: ElementAppearance): void {
  storage.setItem(key, serializeAppearance(state));
}

export function loadAppearance(storage: Pick<Storage, "getItem">, key: string, elementId: string): ElementAppearance | undefined {
  const serialized = storage.getItem(key);
  if (!serialized) return undefined;
  try { return deserializeAppearance(serialized, elementId); } catch { return undefined; }
}

export function rainbowCss(speedLevel: 1 | 2 | 3 | 4 | 5, reducedMotion = false): string {
  if (reducedMotion) return "hsl(262 34% 48%)";
  const seconds = ({ 1: 4, 2: 8, 3: 14, 4: 22, 5: 36 } as const)[speedLevel];
  return `linear-gradient(90deg, hsl(0 85% 55%), hsl(60 85% 55%), hsl(120 70% 45%), hsl(180 75% 48%), hsl(240 80% 60%), hsl(300 75% 58%), hsl(360 85% 55%))`;
}

export function translateHex(hex: string): ColorRepresentations {
  const normalized = hex.startsWith("#") ? hex : `#${hex}`;
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(normalized)) throw new Error("Enter a six- or eight-digit hexadecimal color");
  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  const alpha = normalized.length === 9 ? parseInt(normalized.slice(7, 9), 16) / 255 : 1;
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  const xyz = rgbToXyz(red, green, blue);
  const lab = xyzToLab(xyz[0], xyz[1], xyz[2]);
  const lch = labToLch(lab);
  const oklab = rgbToOklab(red, green, blue);
  const oklch = labToLch(oklab);
  const cmyk = rgbToCmyk(red, green, blue);
  return {
    hex: normalized.toUpperCase(),
    rgba: `rgba(${red}, ${green}, ${blue}, ${round(alpha, 3)})`,
    hsl: `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`,
    hsv: `hsv(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(Math.max(red, green, blue) / 255 * 100)}%)`,
    hwb: `hwb(${Math.round(hue)} ${Math.round(Math.min(red, green, blue) / 255 * 100)}% ${Math.round((1 - Math.max(red, green, blue) / 255) * 100)}%)`,
    lab: `lab(${round(lab[0], 2)}% ${round(lab[1], 2)} ${round(lab[2], 2)})`,
    lch: `lch(${round(lch[0], 2)}% ${round(lch[1], 2)} ${round(lch[2], 2)})`,
    oklab: `oklab(${round(oklab[0] * 100, 2)}% ${round(oklab[1], 4)} ${round(oklab[2], 4)})`,
    oklch: `oklch(${round(oklch[0] * 100, 2)}% ${round(oklch[1], 4)} ${round(oklch[2], 2)})`,
    cmyk: `cmyk(${round(cmyk[0] * 100, 2)}% ${round(cmyk[1] * 100, 2)}% ${round(cmyk[2] * 100, 2)}% ${round(cmyk[3] * 100, 2)}%)`,
    gamut: "srgb",
    contrastRatio: contrastRatio([red, green, blue], [255, 255, 255])
  };
}

function round(value: number, digits: number): number { const factor = 10 ** digits; return Math.round(value * factor) / factor; }

function rgbToXyz(red: number, green: number, blue: number): [number, number, number] {
  const convert = (value: number) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; };
  const r = convert(red), g = convert(green), b = convert(blue);
  return [r * 0.4124 + g * 0.3576 + b * 0.1805, r * 0.2126 + g * 0.7152 + b * 0.0722, r * 0.0193 + g * 0.1192 + b * 0.9505];
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const f = (value: number) => value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
  const fx = f(x / 0.95047), fy = f(y), fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToLch(lab: [number, number, number]): [number, number, number] {
  const chroma = Math.sqrt(lab[1] ** 2 + lab[2] ** 2);
  let hue = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
  if (hue < 0) hue += 360;
  return [lab[0], chroma, hue];
}

function rgbToOklab(red: number, green: number, blue: number): [number, number, number] {
  const convert = (value: number) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; };
  const r = convert(red), g = convert(green), b = convert(blue);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l3 = Math.cbrt(l), m3 = Math.cbrt(m), s3 = Math.cbrt(s);
  return [0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3, 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3, 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3];
}

function rgbToCmyk(red: number, green: number, blue: number): [number, number, number, number] {
  const r = red / 255, g = green / 255, b = blue / 255;
  const key = 1 - Math.max(r, g, b);
  if (key >= 1) return [0, 0, 0, 1];
  return [(1 - r - key) / (1 - key), (1 - g - key) / (1 - key), (1 - b - key) / (1 - key), key];
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const luminance = (rgb: [number, number, number]) => rgb.map((value) => { const channel = value / 255; return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(foreground), b = luminance(background);
  return round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), 2);
}

function cloneAppearance(state: ElementAppearance): ElementAppearance {
  return JSON.parse(JSON.stringify(state)) as ElementAppearance;
}

function recordAppearance(state: ElementAppearance, label: string): ElementAppearance {
  const history = state.history.slice(0, state.historyIndex + 1);
  const snapshot = JSON.stringify({ ...state, history: [], historyIndex: -1 });
  const entry = { id: `change-${history.length + 1}`, label, snapshot };
  return { ...state, history: [...history, entry], historyIndex: history.length };
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return [hue, saturation * 100, lightness * 100];
}
