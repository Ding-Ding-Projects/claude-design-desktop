import * as React from "react";
import type { FunnyLevel, LanguageMode, NarrationPreferences, ScheduleRule, VoiceDescriptor } from "./types";

export interface PreferenceStrings {
  language: string;
  english: string;
  cantonese: string;
  bilingual: string;
  englishFunny: string;
  cantoneseFunny: string;
  showDialogEmojis: string;
  schoolMode: string;
  schoolModeDescription: string;
  schoolModeName: string;
  unlockMethod: string;
  vocabulary: string;
  chooseFile: string;
  clearVocabulary: string;
  narration: string;
  narrationEnabled: string;
  narratorLanguage: string;
  englishVoice: string;
  cantoneseVoice: string;
  chooseAutomatically: string;
  rate: string;
  pitch: string;
  appDisplayName: string;
  reset: string;
}

export const DEFAULT_STRINGS: PreferenceStrings = {
  language: "Language mode", english: "English", cantonese: "Cantonese", bilingual: "Bilingual",
  englishFunny: "English funny level", cantoneseFunny: "Cantonese funny level", showDialogEmojis: "Show emojis in dialogs and message boxes",
  schoolMode: "School mode", schoolModeDescription: "Uses English and suppresses playful and dim-sum features while enabled.", schoolModeName: "School mode name", unlockMethod: "Unlock method",
  vocabulary: "Personal vocabulary", chooseFile: "Choose a local JSON file", clearVocabulary: "Clear vocabulary", narration: "Narration", narrationEnabled: "Read app events aloud", narratorLanguage: "Narrated language",
  englishVoice: "English voice", cantoneseVoice: "Cantonese voice", chooseAutomatically: "Choose automatically", rate: "Rate", pitch: "Pitch", appDisplayName: "App display name", reset: "Reset"
};

export function LanguageModeControl(props: { value: LanguageMode; onChange: (value: LanguageMode) => void; strings?: PreferenceStrings }): React.ReactElement {
  const strings = props.strings ?? DEFAULT_STRINGS;
  return <fieldset className="preference-language-mode">
    <legend>{strings.language}</legend>
    {["english", "cantonese", "bilingual"].map((mode) => <label key={mode}>
      <input type="radio" name="language-mode" value={mode} checked={props.value === mode} onChange={() => props.onChange(mode as LanguageMode)} />
      {strings[mode as "english" | "cantonese" | "bilingual"]}
    </label>)}
  </fieldset>;
}

export function FunnyLevelControl(props: { language: "english" | "cantonese"; value: FunnyLevel; disabled?: boolean; onChange: (value: FunnyLevel) => void; strings?: PreferenceStrings }): React.ReactElement {
  const strings = props.strings ?? DEFAULT_STRINGS;
  const label = props.language === "english" ? strings.englishFunny : strings.cantoneseFunny;
  return <label className="preference-funny-level">
    {label}
    <input type="range" min={1} max={5} step={1} value={props.value} disabled={props.disabled} aria-valuemin={1} aria-valuemax={5} aria-valuenow={props.value} onChange={(event) => props.onChange(Number(event.currentTarget.value) as FunnyLevel)} />
    <output aria-live="polite">{props.value}</output>
  </label>;
}

export function DialogEmojiToggle(props: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; strings?: PreferenceStrings }): React.ReactElement {
  const strings = props.strings ?? DEFAULT_STRINGS;
  return <label><input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(event) => props.onChange(event.currentTarget.checked)} />{strings.showDialogEmojis}</label>;
}

export function SchoolModeControl(props: { enabled: boolean; displayName: string; unlockMethod: "pin" | "password" | "passkey"; onEnabledChange: (value: boolean) => void; onNameChange: (value: string) => void; onUnlockMethodChange: (value: "pin" | "password" | "passkey") => void; strings?: PreferenceStrings }): React.ReactElement {
  const strings = props.strings ?? DEFAULT_STRINGS;
  return <section aria-labelledby="school-mode-heading">
    <h3 id="school-mode-heading">{props.displayName || strings.schoolMode}</h3>
    <p>{strings.schoolModeDescription}</p>
    <label><input type="checkbox" checked={props.enabled} onChange={(event) => props.onEnabledChange(event.currentTarget.checked)} />{props.displayName || strings.schoolMode}</label>
    <label>{strings.schoolModeName}<input type="text" value={props.displayName} maxLength={120} onChange={(event) => props.onNameChange(event.currentTarget.value)} /></label>
    <label>{strings.unlockMethod}<select value={props.unlockMethod} onChange={(event) => props.onUnlockMethodChange(event.currentTarget.value as "pin" | "password" | "passkey")}>
      <option value="pin">PIN</option><option value="password">Password</option><option value="passkey">Passkey</option>
    </select></label>
    <p role="note">This is a local experience lock. Deleting the shared application-data record resets it.</p>
  </section>;
}

export function VocabularyUploadControl(props: { status: "empty" | "loaded" | "invalid"; entryCount: number; errorCode: string | null; onFile: (file: File) => void; onClear: () => void; disabled?: boolean; strings?: PreferenceStrings }): React.ReactElement {
  const strings = props.strings ?? DEFAULT_STRINGS;
  const id = "personal-vocabulary-file";
  return <section aria-labelledby="vocabulary-heading"><h3 id="vocabulary-heading">{strings.vocabulary}</h3>
    <label htmlFor={id}>{strings.chooseFile}</label>
    <input id={id} type="file" accept="application/json,.json" disabled={props.disabled} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) props.onFile(file); }} />
    <p role="status" aria-live="polite">{props.status === "loaded" ? `${props.entryCount} entries loaded locally.` : props.status === "invalid" ? `File refused: ${props.errorCode ?? "invalid-file"}.` : "No file selected. Original wording is active."}</p>
    <button type="button" onClick={props.onClear} disabled={props.disabled || props.status === "empty"}>{strings.clearVocabulary}</button>
  </section>;
}

function VoiceSelect(props: { id: string; label: string; voices: VoiceDescriptor[]; value: string | null; onChange: (value: string | null) => void; automaticLabel: string; disabled?: boolean }): React.ReactElement {
  return <label htmlFor={props.id}>{props.label}<select id={props.id} value={props.value ?? ""} disabled={props.disabled} onChange={(event) => props.onChange(event.currentTarget.value || null)}>
    <option value="">{props.automaticLabel}</option>
    {props.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} ({voice.language}){voice.networkBacked ? " [network]" : ""}</option>)}
  </select></label>;
}

export function NarrationPreferencesControl(props: { value: NarrationPreferences; englishVoices: VoiceDescriptor[]; cantoneseVoices: VoiceDescriptor[]; onChange: (value: NarrationPreferences) => void; disabled?: boolean; strings?: PreferenceStrings }): React.ReactElement {
  const strings = props.strings ?? DEFAULT_STRINGS;
  const update = (patch: Partial<NarrationPreferences>) => props.onChange({ ...props.value, ...patch });
  return <section aria-labelledby="narration-heading"><h3 id="narration-heading">{strings.narration}</h3>
    <label><input type="checkbox" checked={props.value.enabled} disabled={props.disabled} onChange={(event) => update({ enabled: event.currentTarget.checked })} />{strings.narrationEnabled}</label>
    <label>{strings.narratorLanguage}<select value={props.value.language} disabled={props.disabled} onChange={(event) => update({ language: event.currentTarget.value as NarrationPreferences["language"] })}><option value="en">English</option><option value="yue">Cantonese</option><option value="both">Both</option></select></label>
    <VoiceSelect id="english-voice" label={strings.englishVoice} voices={props.englishVoices} value={props.value.englishVoiceId} onChange={(englishVoiceId) => update({ englishVoiceId })} automaticLabel={strings.chooseAutomatically} disabled={props.disabled} />
    <VoiceSelect id="cantonese-voice" label={strings.cantoneseVoice} voices={props.cantoneseVoices} value={props.value.cantoneseVoiceId} onChange={(cantoneseVoiceId) => update({ cantoneseVoiceId })} automaticLabel={strings.chooseAutomatically} disabled={props.disabled} />
    <label>{strings.rate}<input type="number" min={0.1} max={10} step={0.1} value={props.value.rate} disabled={props.disabled} onChange={(event) => update({ rate: Number(event.currentTarget.value) })} /></label>
    <label>{strings.pitch}<input type="number" min={0} max={2} step={0.1} value={props.value.pitch} disabled={props.disabled} onChange={(event) => update({ pitch: Number(event.currentTarget.value) })} /></label>
    <p role="status">Voice lists may arrive after this surface opens. A missing selected voice remains selected and falls back until it is installed.</p>
  </section>;
}

export function ADHDControls(props: { values: Record<"focus" | "lowStimulation" | "timeAwareness" | "oneThingAtATime" | "momentum", boolean>; onChange: (key: keyof typeof props.values, value: boolean) => void; disabled?: boolean }): React.ReactElement {
  const labels = { focus: "Focus", lowStimulation: "Low stimulation", timeAwareness: "Time awareness", oneThingAtATime: "One thing at a time", momentum: "Momentum" } as const;
  return <fieldset><legend>Attention accommodations</legend>{(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <label key={key}><input type="checkbox" checked={props.values[key]} disabled={props.disabled} onChange={(event) => props.onChange(key, event.currentTarget.checked)} />{labels[key]}</label>)}</fieldset>;
}

export function ScheduleRuleSummary(props: { rule: ScheduleRule; onToggle: (enabled: boolean) => void; onRemove: () => void }): React.ReactElement {
  const { rule } = props;
  return <article aria-label={rule.label}><h4>{rule.label}</h4><p>{rule.startTime.hour.toString().padStart(2, "0")}:{rule.startTime.minute.toString().padStart(2, "0")} to {rule.endTime.hour.toString().padStart(2, "0")}:{rule.endTime.minute.toString().padStart(2, "0")} ({rule.timezone})</p><p>{rule.everyDay ? "Every day" : `Weekdays: ${rule.weekdays.join(", ")}`}{rule.endTime.hour * 60 + rule.endTime.minute < rule.startTime.hour * 60 + rule.startTime.minute ? ", crosses midnight" : ""}</p><label><input type="checkbox" checked={rule.enabled} onChange={(event) => props.onToggle(event.currentTarget.checked)} />Enabled</label><button type="button" onClick={props.onRemove}>Remove</button></article>;
}

export function DisplayNameControl(props: { value: string; shippedName: string; onChange: (value: string) => void; onReset: () => void; strings?: PreferenceStrings }): React.ReactElement {
  const strings = props.strings ?? DEFAULT_STRINGS;
  return <label>{strings.appDisplayName}<input type="text" value={props.value} maxLength={120} onChange={(event) => props.onChange(event.currentTarget.value)} /><button type="button" onClick={props.onReset}>{strings.reset}</button><small>Display text changes only. The stable application identity and data location remain unchanged.</small></label>;
}

export function ScheduleRuleEditor(props: { rule: ScheduleRule; onChange: (rule: ScheduleRule) => void }): React.ReactElement {
  const updateTime = (part: "startTime" | "endTime", value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    if (Number.isInteger(hour) && Number.isInteger(minute)) props.onChange({ ...props.rule, [part]: { hour, minute } });
  };
  const updateDate = (part: "startDate" | "endDate", value: string) => {
    if (!value) { props.onChange({ ...props.rule, [part]: null }); return; }
    const [year, month, day] = value.split("-").map(Number);
    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) props.onChange({ ...props.rule, [part]: { year, month, day } });
  };
  return <fieldset aria-label={props.rule.label}>
    <legend>{props.rule.label}</legend>
    <label>Start date<input type="date" value={props.rule.startDate ? `${props.rule.startDate.year.toString().padStart(4, "0")}-${props.rule.startDate.month.toString().padStart(2, "0")}-${props.rule.startDate.day.toString().padStart(2, "0")}` : ""} onChange={(event) => updateDate("startDate", event.currentTarget.value)} /></label>
    <label>End date<input type="date" value={props.rule.endDate ? `${props.rule.endDate.year.toString().padStart(4, "0")}-${props.rule.endDate.month.toString().padStart(2, "0")}-${props.rule.endDate.day.toString().padStart(2, "0")}` : ""} onChange={(event) => updateDate("endDate", event.currentTarget.value)} /></label>
    <label>Start time<input type="time" value={`${props.rule.startTime.hour.toString().padStart(2, "0")}:${props.rule.startTime.minute.toString().padStart(2, "0")}`} onChange={(event) => updateTime("startTime", event.currentTarget.value)} /></label>
    <label>End time<input type="time" value={`${props.rule.endTime.hour.toString().padStart(2, "0")}:${props.rule.endTime.minute.toString().padStart(2, "0")}`} onChange={(event) => updateTime("endTime", event.currentTarget.value)} /></label>
    <label><input type="checkbox" checked={props.rule.everyDay} onChange={(event) => props.onChange({ ...props.rule, everyDay: event.currentTarget.checked })} />Every day</label>
    <p>Times use {props.rule.timezone}. An end time before the start time crosses midnight.</p>
  </fieldset>;
}
