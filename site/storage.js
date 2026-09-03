const DB_NAME = 'claude-design-desktop-site-state';
const STORE_NAME = 'records';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { resolve(null); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openVersionedStore(namespace = 'site', schemaVersion = 1) {
  const fallback = new Map();
  const database = openDatabase().catch(() => null);
  const keyFor = (key) => `${namespace}:v${schemaVersion}:${key}`;
  return {
    async get(key) {
      const db = await database;
      if (!db) return fallback.get(key);
      return new Promise((resolve) => { const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(keyFor(key)); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(fallback.get(key)); });
    },
    async set(key, value) {
      fallback.set(key, value);
      const db = await database;
      if (!db) return;
      return new Promise((resolve) => { const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, keyFor(key)); request.onsuccess = () => resolve(); request.onerror = () => resolve(); });
    },
    async delete(key) {
      fallback.delete(key);
      const db = await database;
      if (!db) return;
      return new Promise((resolve) => { const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(keyFor(key)); request.onsuccess = () => resolve(); request.onerror = () => resolve(); });
    },
    async clear() {
      fallback.clear();
      const db = await database;
      if (!db) return;
      const all = await new Promise((resolve) => { const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve([]); });
      await Promise.all(all.filter((key) => String(key).startsWith(`${namespace}:v${schemaVersion}:`)).map((key) => new Promise((resolve) => { const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key); request.onsuccess = () => resolve(); request.onerror = () => resolve(); })));
    }
  };
}
