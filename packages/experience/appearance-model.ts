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

export function rainbowCss(speedLevel: 1 | 2 | 3 | 4 | 5, reducedMotion = false): string {
  if (reducedMotion) return "hsl(262 34% 48%)";
  const seconds = ({ 1: 4, 2: 8, 3: 14, 4: 22, 5: 36 } as const)[speedLevel];
  return `linear-gradient(90deg, hsl(0 85% 55%), hsl(60 85% 55%), hsl(120 70% 45%), hsl(180 75% 48%), hsl(240 80% 60%), hsl(300 75% 58%), hsl(360 85% 55%)) / ${seconds}s linear infinite`;
}

export function translateHex(hex: string): ColorRepresentations {
  const normalized = hex.startsWith("#") ? hex : `#${hex}`;
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) throw new Error("Enter a six-digit hexadecimal color");
  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  return {
    hex: normalized.toUpperCase(),
    rgba: `rgba(${red}, ${green}, ${blue}, 1)`,
    hsl: `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`,
    hsv: `hsv(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(Math.max(red, green, blue) / 255 * 100)}%)`,
    hwb: `hwb(${Math.round(hue)} ${Math.round(Math.min(red, green, blue) / 255 * 100)}% ${Math.round((1 - Math.max(red, green, blue) / 255) * 100)}%)`,
    lab: "lab(unknown)", lch: "lch(unknown)", oklab: "oklab(unknown)", oklch: "oklch(unknown)", cmyk: "cmyk(unknown)", gamut: "srgb"
  };
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

