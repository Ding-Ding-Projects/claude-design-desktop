/** Public, framework-neutral preference contracts used by the desktop shell. */

export type LanguageMode = "english" | "cantonese" | "bilingual";
export type FunnyLevel = 1 | 2 | 3 | 4 | 5;
export type UnlockMethod = "pin" | "password" | "passkey";

export type AppearanceTheme = "light" | "dark";
export type Density = "comfortable" | "compact" | "spacious";

export interface LanguagePreferences {
  mode: LanguageMode;
  englishFunnyLevel: FunnyLevel;
  cantoneseFunnyLevel: FunnyLevel;
  showDialogEmojis: boolean;
}

export interface SchoolModePreferences {
  enabled: boolean;
  displayName: string;
  unlockMethod: UnlockMethod;
  /** This identifies a vault entry, never a secret value. */
  credentialKey: string | null;
}

export interface AppearancePreferences {
  theme: AppearanceTheme;
  density: Density;
  seedColor: string;
  fontFamily: string;
  fontSizeScale: number;
  fontWeight: number;
}

export interface ADHDPreferences {
  focus: boolean;
  lowStimulation: boolean;
  timeAwareness: boolean;
  oneThingAtATime: boolean;
  momentum: boolean;
}

export type VoiceLanguage = "en" | "yue";

export interface VoiceDescriptor {
  id: string;
  name: string;
  language: string;
  localService: boolean;
  networkBacked: boolean;
}

export interface NarrationPreferences {
  enabled: boolean;
  language: "en" | "yue" | "both";
  englishVoiceId: string | null;
  cantoneseVoiceId: string | null;
  rate: number;
  pitch: number;
  reducedSound: boolean;
  quietHours: boolean;
}

export interface ScheduleDate {
  year: number;
  month: number;
  day: number;
}

export interface ScheduleTime {
  hour: number;
  minute: number;
}

export type ScheduleSource =
  | { kind: "local" }
  | { kind: "api"; url: string; schemaVersion: number }
  | { kind: "home-assistant"; baseUrl: string; entityId: string; credentialKey: string };

export interface ScheduledValues {
  languageMode?: LanguageMode;
  theme?: AppearanceTheme;
  density?: Density;
  seedColor?: string;
  fontFamily?: string;
  fontSizeScale?: number;
  fontWeight?: number;
  displayName?: string;
}

export interface ScheduleRule {
  id: string;
  label: string;
  enabled: boolean;
  priority: number;
  startDate: ScheduleDate | null;
  endDate: ScheduleDate | null;
  startTime: ScheduleTime;
  endTime: ScheduleTime;
  weekdays: number[];
  everyDay: boolean;
  timezone: string;
  values: ScheduledValues;
  source: ScheduleSource;
}

export interface PersonalVocabularyEntry {
  key: string;
  replacement: string;
}

export interface PersonalVocabularyPayload {
  schemaVersion: 1;
  entries: PersonalVocabularyEntry[];
}

export interface PersonalVocabularyState {
  status: "empty" | "loaded" | "invalid";
  schemaVersion: number | null;
  entryCount: number;
  cache: PersonalVocabularyPayload | null;
  errorCode: string | null;
}

export type LogoFit = "contain" | "cover" | "crop";

export interface LogoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogoBackground {
  kind: "transparent" | "solid";
  color: string;
}

export interface LogoSettings {
  presetId: string | null;
  sourceName: string | null;
  sourceMime: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" | null;
  fit: LogoFit;
  crop: LogoCrop | null;
  focalPoint: { x: number; y: number };
  background: LogoBackground;
  safeArea?: LogoCrop;
  derivedSizes: number[];
}

export interface DisplayNamePreferences {
  displayName: string;
  shippedName: string;
  stableApplicationId: string;
  stableDataDirectoryKey: string;
}

export interface ExternalEditorDescriptor {
  id: string;
  displayName: string;
  executablePath: string;
  source: "path" | "known-location" | "user-registered";
  supportsFiles: boolean;
  supportsFolders: boolean;
}

export type ExportFormat = "json" | "jsonl" | "yaml" | "toml" | "xml" | "csv" | "tsv" | "markdown" | "html" | "sql" | "typescript" | "javascript" | "python" | "go" | "rust" | "json-schema" | "protobuf";

export interface ExportRequest {
  format: ExportFormat;
  records: readonly Record<string, unknown>[];
  includeSensitive: false;
  note: string;
}

export interface BulkPreviewItem {
  id: string;
  label: string;
  selected: boolean;
  eligible: boolean;
  reason: string | null;
}

export interface BulkActionPreview {
  action: "delete" | "export" | "move" | "copy" | "duplicate" | "rename" | "enable" | "disable" | "retry";
  scope: "page" | "all-matches";
  selectedCount: number;
  affectedCount: number;
  excludedCount: number;
  items: readonly BulkPreviewItem[];
}

export interface PreferencesState {
  language: LanguagePreferences;
  school: SchoolModePreferences;
  appearance: AppearancePreferences;
  adhd: ADHDPreferences;
  narration: NarrationPreferences;
  scheduleRules: ScheduleRule[];
  vocabulary: PersonalVocabularyState;
  logo: LogoSettings;
  displayName: DisplayNamePreferences;
}

export const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  mode: "bilingual",
  englishFunnyLevel: 5,
  cantoneseFunnyLevel: 5,
  showDialogEmojis: true
};

export const DEFAULT_SCHOOL_MODE: SchoolModePreferences = {
  enabled: false,
  displayName: "School mode",
  unlockMethod: "pin",
  credentialKey: null
};

export const DEFAULT_ADHD_PREFERENCES: ADHDPreferences = {
  focus: false,
  lowStimulation: false,
  timeAwareness: false,
  oneThingAtATime: false,
  momentum: false
};

export const DEFAULT_NARRATION_PREFERENCES: NarrationPreferences = {
  enabled: false,
  language: "both",
  englishVoiceId: null,
  cantoneseVoiceId: null,
  rate: 1,
  pitch: 1,
  reducedSound: false,
  quietHours: false
};
