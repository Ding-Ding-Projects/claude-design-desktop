export type TabDock = "left" | "right" | "top" | "bottom";

export type Tab = {
  id: string;
  label: string;
  title?: string;
  groupId?: string;
  pinned: boolean;
  locked?: boolean;
  dirty?: boolean;
  page: string;
  order: number;
};

export type TabGroup = {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  pinned: boolean;
  order: number;
};

export type SearchMode = "text" | "regex";

export type SearchState = {
  query: string;
  pattern: string;
  flags: string;
  mode: SearchMode;
  valid: boolean;
  error?: string;
};

export type SearchScope = "strip" | "group" | "groups" | "all";

export type RegexCapability = {
  name: string;
  supported: boolean;
  explanation: string;
};

export type RegexWorkbenchState = {
  engine: string;
  engineVersion: string;
  dialect: string;
  pattern: string;
  flags: string;
  sample: string;
  replacement: string;
  mode: SearchMode;
  valid: boolean;
  error?: string;
  explanation: string;
  tokens: Array<{ text: string; kind: string; note: string }>;
  matches: Array<{ index: number; text: string; groups: Record<string, string> }>;
  replacementPreview: string;
  tests: Array<{ id: string; input: string; expected: boolean; actual?: boolean }>;
  snippets: Array<{ id: string; name: string; pattern: string; flags: string }>;
  performance: { elapsedMs: number; matchCount: number; risk: "low" | "medium" | "high" };
  trace: Array<{ step: number; position: number; state: string }>;
  capabilities: RegexCapability[];
};

export type AppearanceLayer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  properties: Record<string, unknown>;
};

export type TypographySettings = {
  family: string;
  sizePx: number;
  weight: number;
  style: "normal" | "italic" | "oblique";
  underline: "none" | "single" | "double";
  strike: "none" | "single" | "double";
  overline: boolean;
  letterSpacingPx: number;
  wordSpacingPx: number;
  lineHeight: number;
  baselineOffsetPx: number;
  textColor: string;
  highlightColor: string;
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize" | "small-caps";
  direction: "ltr" | "rtl";
  alignment: "start" | "center" | "end" | "justify";
};

export type ColorRepresentations = {
  hex: string;
  rgba: string;
  hsl: string;
  hsv: string;
  hwb: string;
  lab: string;
  lch: string;
  oklab: string;
  oklch: string;
  cmyk: string;
  named?: string;
  gamut: "srgb" | "display-p3" | "unknown";
  contrastRatio?: number;
};

export type ElementAppearance = {
  elementId: string;
  properties: Record<string, unknown>;
  stateOverrides: Record<string, Record<string, unknown>>;
  layers: AppearanceLayer[];
  typography: TypographySettings;
  color: ColorRepresentations | { sentinel: "rainbow"; speedLevel: 1 | 2 | 3 | 4 | 5 };
  history: Array<{ id: string; label: string; snapshot: string }>;
  historyIndex: number;
};

export type AppearancePreset = {
  id: string;
  name: string;
  description: string;
  appearance: ElementAppearance;
};

export type CommandDescriptor = {
  id: string;
  label: string;
  kind: "command" | "destination" | "setting" | "appearance";
  tabId?: string;
  groupId?: string;
  elementId?: string;
  shortcut?: string;
  value?: unknown;
};

export type ContextAction = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  reason?: string;
};

export type ContextMenuDescriptor = {
  targetId: string;
  accessibleName: string;
  actions: ContextAction[];
  keyboardEquivalent: string;
  touchEquivalent: string;
  search: SearchState;
};

