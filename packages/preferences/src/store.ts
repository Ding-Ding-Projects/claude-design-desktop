import {
  DEFAULT_ADHD_PREFERENCES,
  DEFAULT_LANGUAGE_PREFERENCES,
  DEFAULT_NARRATION_PREFERENCES,
  DEFAULT_SCHOOL_MODE,
  type ADHDPreferences,
  type LanguagePreferences,
  type PersonalVocabularyEntry,
  type PersonalVocabularyPayload,
  type PersonalVocabularyState,
  type PreferencesState,
  type SchoolModePreferences
} from "./types";

export const PREFERENCES_STORAGE_KEY = "claude-design.preferences.v1";
export const SHARED_SCHOOL_STORAGE_KEY = "claude-design.school-mode.v1";
export const PERSONAL_VOCABULARY_STORAGE_KEY = "claude-design.personal-vocabulary.v1";
export const MAX_VOCABULARY_BYTES = 256 * 1024;
export const MAX_VOCABULARY_DEPTH = 4;
export const MAX_VOCABULARY_ENTRIES = 2_000;
export const MAX_VOCABULARY_KEY_LENGTH = 160;
export const MAX_VOCABULARY_VALUE_LENGTH = 2_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PreferenceChange {
  key: keyof PreferencesState | "school" | "vocabulary";
  state: PreferencesState;
}

type Listener = (change: PreferenceChange) => void;

const memoryStorage = new Map<string, string>();
const fallbackStorage: StorageLike = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => memoryStorage.set(key, value),
  removeItem: (key) => memoryStorage.delete(key)
};

export function getLocalStorage(): StorageLike {
  if (typeof globalThis.localStorage !== "undefined") {
    return globalThis.localStorage;
  }
  return fallbackStorage;
}

function cloneState(state: PreferencesState): PreferencesState {
  return JSON.parse(JSON.stringify(state)) as PreferencesState;
}

export function createDefaultPreferences(shippedName = "Claude Design", stableApplicationId = "claude-design-desktop"): PreferencesState {
  return {
    language: { ...DEFAULT_LANGUAGE_PREFERENCES },
    school: { ...DEFAULT_SCHOOL_MODE },
    appearance: {
      theme: "light",
      density: "comfortable",
      seedColor: "#6750A4",
      fontFamily: "system-ui",
      fontSizeScale: 1,
      fontWeight: 400
    },
    adhd: { ...DEFAULT_ADHD_PREFERENCES },
    narration: { ...DEFAULT_NARRATION_PREFERENCES },
    scheduleRules: [],
    vocabulary: emptyVocabularyState(),
    logo: {
      presetId: "shipped",
      sourceName: null,
      sourceMime: null,
      fit: "contain",
      crop: null,
      focalPoint: { x: 0.5, y: 0.5 },
      background: { kind: "transparent", color: "#FFFFFF" },
      derivedSizes: [16, 32, 48, 64, 128, 256, 512]
    },
    displayName: {
      displayName: shippedName,
      shippedName,
      stableApplicationId,
      stableDataDirectoryKey: stableApplicationId
    }
  };
}

export function emptyVocabularyState(): PersonalVocabularyState {
  return { status: "empty", schemaVersion: null, entryCount: 0, cache: null, errorCode: null };
}

export function loadPreferences(storage: StorageLike = getLocalStorage(), defaults = createDefaultPreferences()): PreferencesState {
  const raw = storage.getItem(PREFERENCES_STORAGE_KEY);
  if (!raw) return cloneState(defaults);
  try {
    const parsed = JSON.parse(raw) as Partial<PreferencesState>;
    return mergePreferences(defaults, parsed);
  } catch {
    return cloneState(defaults);
  }
}

function mergePreferences(defaults: PreferencesState, parsed: Partial<PreferencesState>): PreferencesState {
  const result = cloneState(defaults);
  if (parsed.language && typeof parsed.language === "object") result.language = { ...result.language, ...parsed.language };
  if (parsed.school && typeof parsed.school === "object") result.school = { ...result.school, ...parsed.school };
  if (parsed.appearance && typeof parsed.appearance === "object") result.appearance = { ...result.appearance, ...parsed.appearance };
  if (parsed.adhd && typeof parsed.adhd === "object") result.adhd = { ...result.adhd, ...parsed.adhd };
  if (parsed.narration && typeof parsed.narration === "object") result.narration = { ...result.narration, ...parsed.narration };
  if (Array.isArray(parsed.scheduleRules)) result.scheduleRules = parsed.scheduleRules.slice();
  if (parsed.logo && typeof parsed.logo === "object") result.logo = { ...result.logo, ...parsed.logo };
  if (parsed.displayName && typeof parsed.displayName === "object") {
    result.displayName = { ...result.displayName, ...parsed.displayName, stableApplicationId: defaults.displayName.stableApplicationId, stableDataDirectoryKey: defaults.displayName.stableDataDirectoryKey };
  }
  return result;
}

export function createPreferencesStore(options: {
  defaults?: PreferencesState;
  storage?: StorageLike;
  broadcast?: boolean;
} = {}) {
  const storage = options.storage ?? getLocalStorage();
  let state = loadPreferences(storage, options.defaults ?? createDefaultPreferences());
  state.vocabulary = loadCachedPersonalVocabulary(storage);
  const listeners = new Set<Listener>();
  const channel = options.broadcast !== false && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("claude-design-preferences")
    : null;

  const emit = (key: PreferenceChange["key"]) => {
    const change = { key, state: cloneState(state) };
    listeners.forEach((listener) => listener(change));
  };

  const persist = () => storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(state));
  const setState = (next: PreferencesState, key: PreferenceChange["key"]) => {
    state = cloneState(next);
    persist();
    channel?.postMessage({ state, key });
    emit(key);
  };

  channel?.addEventListener("message", (event) => {
    const incoming = event.data as { state?: PreferencesState; key?: PreferenceChange["key"] };
    if (!incoming?.state) return;
    state = cloneState(incoming.state);
    emit(incoming.key ?? "language");
  });

  return {
    getState: () => cloneState(state),
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateLanguage(patch: Partial<LanguagePreferences>) {
      setState({ ...state, language: { ...state.language, ...patch } }, "language");
    },
    updateADHD(patch: Partial<ADHDPreferences>) {
      setState({ ...state, adhd: { ...state.adhd, ...patch } }, "adhd");
    },
    updateSchool(patch: Partial<SchoolModePreferences>) {
      const school = { ...state.school, ...patch };
      storage.setItem(SHARED_SCHOOL_STORAGE_KEY, JSON.stringify({ ...school, credentialKey: null }));
      setState({ ...state, school }, "school");
    },
    renameDisplayName(displayName: string) {
      const value = displayName.trim();
      if (!value || value.length > 120) throw new Error("Display name must contain 1 to 120 characters.");
      setState({ ...state, displayName: { ...state.displayName, displayName: value } }, "displayName");
    },
    resetDisplayName() {
      setState({ ...state, displayName: { ...state.displayName, displayName: state.displayName.shippedName } }, "displayName");
    },
    getEffectiveLanguage(): LanguagePreferences {
      return state.school.enabled
        ? { ...state.language, mode: "english", englishFunnyLevel: 1, cantoneseFunnyLevel: 1, showDialogEmojis: false }
        : { ...state.language };
    },
    featureAvailability() {
      const suppressed = state.school.enabled;
      return { cantonese: !suppressed, bilingual: !suppressed, funnyLevels: !suppressed, vocabulary: !suppressed, dimSum: !suppressed };
    },
    close() {
      channel?.close();
    }
  };
}

export function readSharedSchoolMode(storage: StorageLike = getLocalStorage(), defaults = DEFAULT_SCHOOL_MODE): SchoolModePreferences {
  try {
    const parsed = JSON.parse(storage.getItem(SHARED_SCHOOL_STORAGE_KEY) ?? "null") as Partial<SchoolModePreferences> | null;
    return parsed ? { ...defaults, ...parsed, credentialKey: null } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function clearPersonalVocabulary(storage: StorageLike = getLocalStorage()): void {
  storage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
}

export function loadCachedPersonalVocabulary(storage: StorageLike = getLocalStorage()): PersonalVocabularyState {
  const raw = storage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
  if (!raw) return emptyVocabularyState();
  const result = parsePersonalVocabulary(raw);
  if (result.ok === false) return { status: "invalid", schemaVersion: null, entryCount: 0, cache: null, errorCode: result.error };
  return { status: "loaded", schemaVersion: 1, entryCount: result.value.entries.length, cache: result.value, errorCode: null };
}

export function parseAndCachePersonalVocabulary(input: string | Uint8Array, storage: StorageLike = getLocalStorage()): PersonalVocabularyState {
  const result = parsePersonalVocabulary(input);
  if (result.ok === false) return { status: "invalid", schemaVersion: null, entryCount: 0, cache: null, errorCode: result.error };
  storage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, JSON.stringify(result.value));
  return { status: "loaded", schemaVersion: 1, entryCount: result.value.entries.length, cache: result.value, errorCode: null };
}

export function parsePersonalVocabulary(input: string | Uint8Array): { ok: true; value: PersonalVocabularyPayload } | { ok: false; error: string } {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > MAX_VOCABULARY_BYTES) return { ok: false, error: "file-too-large" };
  let parsed: unknown;
  try {
    parsed = new JsonReader(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).parse();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "invalid-json" };
  }
  if (!isPlainRecord(parsed)) return { ok: false, error: "root-must-be-object" };
  const keys = Object.keys(parsed);
  if (keys.length !== 2 || !keys.includes("schemaVersion") || !keys.includes("entries")) return { ok: false, error: "unknown-field" };
  if (parsed.schemaVersion !== 1) return { ok: false, error: "unsupported-schema-version" };
  if (!Array.isArray(parsed.entries) || parsed.entries.length > MAX_VOCABULARY_ENTRIES) return { ok: false, error: "entry-count-out-of-range" };
  const entries: PersonalVocabularyEntry[] = [];
  for (const item of parsed.entries) {
    if (!isPlainRecord(item) || Object.keys(item).length !== 2 || typeof item.key !== "string" || typeof item.replacement !== "string") return { ok: false, error: "invalid-entry" };
    if (item.key.length === 0 || item.key.length > MAX_VOCABULARY_KEY_LENGTH || item.replacement.length > MAX_VOCABULARY_VALUE_LENGTH) return { ok: false, error: "entry-string-too-long" };
    if (isUnsafeKey(item.key)) return { ok: false, error: "unsafe-key" };
    entries.push({ key: item.key, replacement: item.replacement });
  }
  return { ok: true, value: { schemaVersion: 1, entries } };
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUnsafeKey(value: string): boolean {
  return value === "__proto__" || value === "prototype" || value === "constructor" || value.includes(String.fromCharCode(0));
}

/** Small JSON reader that detects duplicate object keys before values are materialized. */
class JsonReader {
  private index = 0;
  constructor(private readonly source: string) {}
  parse(): unknown {
    const value = this.value(0);
    this.space();
    if (this.index !== this.source.length) throw new Error("trailing-data");
    return value;
  }
  private value(depth: number): unknown {
    if (depth > MAX_VOCABULARY_DEPTH) throw new Error("nesting-too-deep");
    this.space();
    const char = this.source[this.index];
    if (char === "{") return this.object(depth + 1);
    if (char === "[") return this.array(depth + 1);
    if (char === '"') return this.string();
    if (this.source.startsWith("true", this.index)) { this.index += 4; return true; }
    if (this.source.startsWith("false", this.index)) { this.index += 5; return false; }
    if (this.source.startsWith("null", this.index)) { this.index += 4; return null; }
    const match = this.source.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (match) { this.index += match[0].length; return Number(match[0]); }
    throw new Error("invalid-value");
  }
  private object(depth: number): Record<string, unknown> {
    this.index++;
    const output: Record<string, unknown> = {};
    const keys = new Set<string>();
    this.space();
    if (this.source[this.index] === "}") { this.index++; return output; }
    while (this.index < this.source.length) {
      this.space();
      const key = this.string();
      if (keys.has(key)) throw new Error("duplicate-key");
      keys.add(key);
      this.space();
      if (this.source[this.index++] !== ":") throw new Error("missing-colon");
      output[key] = this.value(depth);
      this.space();
      const delimiter = this.source[this.index++];
      if (delimiter === "}") return output;
      if (delimiter !== ",") throw new Error("missing-comma");
    }
    throw new Error("unterminated-object");
  }
  private array(depth: number): unknown[] {
    this.index++;
    const output: unknown[] = [];
    this.space();
    if (this.source[this.index] === "]") { this.index++; return output; }
    while (this.index < this.source.length) {
      output.push(this.value(depth));
      this.space();
      const delimiter = this.source[this.index++];
      if (delimiter === "]") return output;
      if (delimiter !== ",") throw new Error("missing-comma");
    }
    throw new Error("unterminated-array");
  }
  private string(): string {
    if (this.source[this.index++] !== '"') throw new Error("expected-string");
    let output = "";
    while (this.index < this.source.length) {
      const char = this.source[this.index++];
      if (char === '"') return output;
      if (char !== "\\") { output += char; continue; }
      const escaped = this.source[this.index++];
      const map: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (escaped === "u") {
        const code = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(code)) throw new Error("invalid-unicode-escape");
        output += String.fromCharCode(Number.parseInt(code, 16));
        this.index += 4;
      } else if (escaped in map) output += map[escaped];
      else throw new Error("invalid-escape");
    }
    throw new Error("unterminated-string");
  }
  private space(): void { while (/\s/.test(this.source[this.index] ?? "")) this.index++; }
}
