import type { LanguageMode } from "./types.js";

export type CopyValue = { en: string; yue: string };
export interface LocaleSettings {
  mode: LanguageMode;
  englishFunnyLevel: 1 | 2 | 3 | 4 | 5;
  cantoneseFunnyLevel: 1 | 2 | 3 | 4 | 5;
  showDialogEmojis: boolean;
}

export const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  mode: "en", englishFunnyLevel: 5, cantoneseFunnyLevel: 5, showDialogEmojis: true
};

const tone = (value: string, level: number, language: "en" | "yue"): string => {
  if (level <= 1) return value;
  if (language === "yue") return level >= 5 ? `${value}，今次唔使同介面鬥氣。` : `${value}。`;
  return level >= 5 ? `${value} The interface has brought snacks.` : `${value}.`;
};

export function localize(copy: CopyValue, settings: LocaleSettings): string {
  const english = tone(copy.en, settings.englishFunnyLevel, "en");
  const cantonese = tone(copy.yue, settings.cantoneseFunnyLevel, "yue");
  if (settings.mode === "en") return english;
  if (settings.mode === "yue") return cantonese;
  return `${english}\n${cantonese}`;
}

export function withDialogEmoji(value: string, emoji: string, settings: LocaleSettings): string {
  return settings.showDialogEmojis ? `${emoji} ${value}` : value;
}

export function clampFunnyLevel(value: unknown): LocaleSettings["englishFunnyLevel"] {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 5;
  return Math.max(1, Math.min(5, number)) as LocaleSettings["englishFunnyLevel"];
}

export function updateLocaleSettings(current: LocaleSettings, patch: Partial<LocaleSettings>): LocaleSettings {
  return {
    mode: patch.mode ?? current.mode,
    englishFunnyLevel: clampFunnyLevel(patch.englishFunnyLevel ?? current.englishFunnyLevel),
    cantoneseFunnyLevel: clampFunnyLevel(patch.cantoneseFunnyLevel ?? current.cantoneseFunnyLevel),
    showDialogEmojis: patch.showDialogEmojis ?? current.showDialogEmojis
  };
}
