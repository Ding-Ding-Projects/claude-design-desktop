import type { NarrationPreferences, VoiceDescriptor } from "./types.js";

export interface SpeechUtterance {
  text: string;
  language: "en" | "yue";
  voice?: VoiceDescriptor | undefined;
  rate: number;
  pitch: number;
}
export interface SpeechDriver {
  speak(utterance: SpeechUtterance): Promise<void>;
  cancel(): void;
  listVoices(): VoiceDescriptor[];
  onVoicesChanged(listener: () => void): () => void;
}

export interface NarrationEnvironment {
  screenReaderActive?: () => boolean;
  reducedSound?: () => boolean;
  quietHours?: () => boolean;
}
export interface NarrationQueueOptions {
  debounceMs?: number;
  categoryCooldownMs?: number;
  speechTimeoutMs?: number;
  onFailure?: (error: Error) => void;
  now?: () => number;
}

export interface NarrationQueue {
  refreshVoices(): VoiceDescriptor[];
  getVoices(language: "en" | "yue"): VoiceDescriptor[];
  enqueue(text: { english?: string; cantonese?: string }, preferences: NarrationPreferences, options?: { category?: string }): void;
  clear(): void;
  isSpeaking(): boolean;
  dispose(): void;
}

function voiceMatches(voice: VoiceDescriptor, language: "en" | "yue"): boolean {
  const tag = voice.language.toLowerCase().replace("_", "-");
  return language === "en" ? tag.startsWith("en") : tag.startsWith("yue") || tag.startsWith("zh-hk") || tag.startsWith("zh-hant");
}

function clampRate(value: number): number {
  return Number.isFinite(value) ? Math.min(10, Math.max(0.1, value)) : 1;
}

function clampPitch(value: number): number {
  return Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 1;
}

export function createNarrationQueue(driver: SpeechDriver, environment: NarrationEnvironment = {}, options: NarrationQueueOptions = {}): NarrationQueue {
  let voices = safeListVoices(driver, options.onFailure);
  let speaking = false;
  let disposed = false;
  let queued: SpeechUtterance[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const lastAccepted = new Map<string, number>();
  const debounceMs = Math.max(0, Math.min(2_000, options.debounceMs ?? 80));
  const categoryCooldownMs = Math.max(0, Math.min(60_000, options.categoryCooldownMs ?? 1_000));
  const speechTimeoutMs = Math.max(250, Math.min(60_000, options.speechTimeoutMs ?? 10_000));
  const now = options.now ?? (() => Date.now());
  const unsubscribe = driver.onVoicesChanged(() => {
    voices = safeListVoices(driver, options.onFailure);
  });

  const pickVoice = (language: "en" | "yue", id: string | null): VoiceDescriptor | undefined => {
    const selected = id ? voices.find((voice) => voice.id === id && voiceMatches(voice, language)) : undefined;
    return selected;
  };

  const pump = async () => {
    if (speaking || disposed || queued.length === 0) return;
    const utterance = queued.shift();
    if (!utterance) return;
    speaking = true;
    try {
      await speakWithDeadline(driver, utterance, speechTimeoutMs, options.onFailure);
    } finally {
      speaking = false;
      void pump();
    }
  };

  return {
    refreshVoices() {
      voices = safeListVoices(driver, options.onFailure);
      return voices.slice();
    },
    getVoices(language) {
      return voices.filter((voice) => voiceMatches(voice, language));
    },
    enqueue(text, preferences, enqueueOptions = {}) {
      if (disposed || !preferences.enabled || environment.screenReaderActive?.() || environment.reducedSound?.() || environment.quietHours?.() || preferences.reducedSound || preferences.quietHours) return;
      const category = enqueueOptions.category ?? "default";
      const acceptedAt = now();
      const last = lastAccepted.get(category);
      if (last !== undefined && acceptedAt - last < categoryCooldownMs) return;
      const rate = clampRate(preferences.rate);
      const pitch = clampPitch(preferences.pitch);
      const utterances: SpeechUtterance[] = [];
      if ((preferences.language === "en" || preferences.language === "both") && text.english?.trim()) {
        utterances.push({ text: text.english, language: "en", voice: pickVoice("en", preferences.englishVoiceId), rate, pitch });
      }
      if ((preferences.language === "yue" || preferences.language === "both") && text.cantonese?.trim()) {
        utterances.push({ text: text.cantonese, language: "yue", voice: pickVoice("yue", preferences.cantoneseVoiceId), rate, pitch });
      }
      if (utterances.length === 0) return;
      /* New events supersede stale queued announcements, but never interrupt speech in flight. */
      queued = utterances;
      lastAccepted.set(category, acceptedAt);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { debounceTimer = undefined; void pump(); }, debounceMs);
    },
    clear() {
      queued = [];
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = undefined; }
    },
    isSpeaking() {
      return speaking;
    },
    dispose() {
      disposed = true;
      queued = [];
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
      driver.cancel();
    }
  };
}

function safeListVoices(driver: SpeechDriver, onFailure?: (error: Error) => void): VoiceDescriptor[] {
  try {
    return driver.listVoices().slice(0, 1_000);
  } catch (error) {
    onFailure?.(error instanceof Error ? error : new Error("voice-enumeration-failure"));
    return [];
  }
}

async function speakWithDeadline(driver: SpeechDriver, utterance: SpeechUtterance, timeoutMs: number, onFailure?: (error: Error) => void): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("speech-timeout")), timeoutMs); });
  try {
    await Promise.race([driver.speak(utterance), deadline]);
  } catch (error) {
    driver.cancel();
    onFailure?.(error instanceof Error ? error : new Error("speech-failure"));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createBrowserSpeechDriver(speech?: SpeechSynthesis): SpeechDriver {
  const speechApi = speech ?? (typeof globalThis.speechSynthesis !== "undefined" ? globalThis.speechSynthesis : null);
  if (!speechApi) {
    return {
      speak: async () => undefined,
      cancel: () => undefined,
      listVoices: () => [],
      onVoicesChanged: () => () => undefined
    };
  }
  let voiceListeners: Array<() => void> = [];
  const mapVoice = (voice: SpeechSynthesisVoice): VoiceDescriptor => ({
    id: voice.voiceURI || `${voice.lang}:${voice.name}`,
    name: voice.name,
    language: voice.lang,
    localService: voice.localService,
    networkBacked: !voice.localService
  });
  const notify = () => voiceListeners.slice().forEach((listener) => listener());
  speechApi.addEventListener("voiceschanged", notify);
  return {
    speak(utterance) {
      return new Promise((resolve) => {
        const item = new SpeechSynthesisUtterance(utterance.text);
        item.lang = utterance.language === "yue" ? "yue-HK" : "en-US";
        item.rate = utterance.rate;
        item.pitch = utterance.pitch;
        if (utterance.voice) {
          const native = speechApi.getVoices().find((voice) => (voice.voiceURI || `${voice.lang}:${voice.name}`) === utterance.voice?.id);
          if (native) item.voice = native;
        }
        item.onend = () => resolve();
        item.onerror = () => resolve();
        speechApi.speak(item);
      });
    },
    cancel() { speechApi.cancel(); },
    listVoices() { return speechApi.getVoices().map(mapVoice); },
    onVoicesChanged(listener) {
      voiceListeners.push(listener);
      return () => { voiceListeners = voiceListeners.filter((item) => item !== listener); };
    }
  };
}
