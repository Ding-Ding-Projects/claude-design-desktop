import type { LanguageMode } from "./types.js";

export interface SchoolModeState { enabled: boolean; name: string; unlockMethod: "pin" | "password" | "passkey"; }
export const DEFAULT_SCHOOL_MODE: SchoolModeState = { enabled: false, name: "School mode", unlockMethod: "pin" };

export function effectiveLanguage(mode: LanguageMode, school: SchoolModeState): "en" | "yue" | "bilingual" {
  return school.enabled ? "en" : mode;
}

export function suppressedFeatureIds(school: SchoolModeState): ReadonlySet<string> {
  return school.enabled ? new Set(["language-modes", "personal-vocabulary-upload", "dim-sum-surprise"]) : new Set();
}

export function canLeaveSchoolMode(input: { credentialVerified: boolean; school: SchoolModeState }): boolean {
  return input.credentialVerified && input.school.enabled;
}
