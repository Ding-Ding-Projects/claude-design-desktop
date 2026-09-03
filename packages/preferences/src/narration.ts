import type { NarrationPreferences, VoiceDescriptor } from "./types";

export interface SpeechUtterance {
  text: string;
  language: "en" | "yue";
  voice?: VoiceDescriptor;
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

export interface NarrationQueue {
  refreshVoices(): VoiceDescriptor[];
  getVoices(language: "en" | "yue"): VoiceDescriptor[];
  enqueue(text: { english?: string; cantonese?: string }, preferences: NarrationPreferences): void;
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

export function createNarrationQueue(driver: SpeechDriver, environment: NarrationEnvironment = {}): NarrationQueue {
  let voices = driver.listVoices();
  let speaking = false;
  let disposed = false;
  let queued: SpeechUtterance[] = [];
  const unsubscribe = driver.onVoicesChanged(() => {
    voices = driver.listVoices();
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
      await driver.speak(utterance);
    } finally {
      speaking = false;
      void pump();
    }
  };

  return {
    refreshVoices() {
      voices = driver.listVoices();
      return voices.slice();
    },
    getVoices(language) {
      return voices.filter((voice) => voiceMatches(voice, language));
    },
    enqueue(text, preferences) {
      if (disposed || !preferences.enabled || environment.screenReaderActive?.() || environment.reducedSound?.() || environment.quietHours?.() || preferences.reducedSound || preferences.quietHours) return;
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
      void pump();
    },
    clear() {
      queued = [];
    },
    isSpeaking() {
      return speaking;
    },
    dispose() {
      disposed = true;
      queued = [];
      unsubscribe();
      driver.cancel();
    }
  };
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

