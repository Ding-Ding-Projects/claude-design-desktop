export interface PreferenceHistoryRecord {
  id: string;
  timestamp: string;
  action: string;
  fields: string[];
}

export interface PreferenceHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PREFERENCE_HISTORY_STORAGE_KEY = "claude-design.preferences-history.v1";
const MAX_HISTORY_RECORDS = 5_000;

export function createPreferenceHistory(storage: PreferenceHistoryStorage): {
  append(action: string, fields: string[]): PreferenceHistoryRecord;
  list(): PreferenceHistoryRecord[];
  reset(): PreferenceHistoryRecord;
} {
  const list = (): PreferenceHistoryRecord[] => {
    try {
      const parsed = JSON.parse(storage.getItem(PREFERENCE_HISTORY_STORAGE_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isRecord).slice(-MAX_HISTORY_RECORDS) as PreferenceHistoryRecord[] : [];
    } catch {
      return [];
    }
  };
  const save = (records: PreferenceHistoryRecord[]) => storage.setItem(PREFERENCE_HISTORY_STORAGE_KEY, JSON.stringify(records.slice(-MAX_HISTORY_RECORDS)));
  return {
    append(action, fields) {
      const record = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: new Date().toISOString(), action, fields: [...new Set(fields)].slice(0, 100) };
      save([...list(), record]);
      return record;
    },
    list,
    reset() {
      storage.removeItem(PREFERENCE_HISTORY_STORAGE_KEY);
      return { id: `${Date.now()}-reset`, timestamp: new Date().toISOString(), action: "history-reset", fields: [] };
    }
  };
}

function isRecord(value: unknown): value is PreferenceHistoryRecord {
  return Boolean(value && typeof value === "object" && typeof (value as PreferenceHistoryRecord).id === "string" && typeof (value as PreferenceHistoryRecord).action === "string" && Array.isArray((value as PreferenceHistoryRecord).fields));
}
