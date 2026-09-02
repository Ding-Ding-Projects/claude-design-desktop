export interface PersonalVocabularyFile {
  schemaVersion: 1;
  entries: Record<string, string>;
}

export const PERSONAL_VOCABULARY_LIMITS = { maxBytes: 256 * 1024, maxEntries: 500, maxKeyLength: 120, maxValueLength: 240 } as const;

function duplicateSafeParse(text: string): unknown {
  const keys = new Set<string>();
  const keyPattern = /(?:^|[,{}])\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(text))) {
    const key = JSON.parse(`"${match[1]}"`) as string;
    if (keys.has(key)) throw new Error("Duplicate object key");
    keys.add(key);
  }
  return JSON.parse(text);
}

export function validatePersonalVocabulary(input: Uint8Array | string): PersonalVocabularyFile {
  const text = typeof input === "string" ? input : new TextDecoder().decode(input);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > PERSONAL_VOCABULARY_LIMITS.maxBytes) throw new Error("Vocabulary file exceeds the size limit");
  let value: unknown;
  try { value = duplicateSafeParse(text); } catch (error) { throw new Error(`Invalid vocabulary JSON: ${error instanceof Error ? error.message : "parse error"}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Vocabulary root must be an object");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || !record.entries || typeof record.entries !== "object" || Array.isArray(record.entries)) throw new Error("Unsupported vocabulary schema");
  const entries = record.entries as Record<string, unknown>;
  const keys = Object.keys(entries);
  if (keys.length > PERSONAL_VOCABULARY_LIMITS.maxEntries) throw new Error("Vocabulary has too many entries");
  const result: Record<string, string> = {};
  for (const key of keys) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("Unsafe vocabulary key");
    const mapped = entries[key];
    if (key.length === 0 || key.length > PERSONAL_VOCABULARY_LIMITS.maxKeyLength || typeof mapped !== "string" || mapped.length > PERSONAL_VOCABULARY_LIMITS.maxValueLength) throw new Error("Vocabulary entry is outside limits");
    result[key] = mapped;
  }
  return { schemaVersion: 1, entries: result };
}

export function applyPersonalVocabulary(text: string, vocabulary: PersonalVocabularyFile | undefined): string {
  if (!vocabulary) return text;
  return Object.entries(vocabulary.entries).reduce((result, [from, to]) => result.split(from).join(to), text);
}
