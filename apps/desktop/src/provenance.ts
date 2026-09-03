import { readFileSync } from "node:fs";

export type PackagedProvenance = { version: string; updatedAt: string };

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/** Read release metadata shipped beside the renderer. Missing metadata is intentionally unavailable. */
export function readPackagedProvenance(path: string, runningVersion: string): PackagedProvenance {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { version: runningVersion, updatedAt: "" };
    const record = value as Record<string, unknown>;
    if (record.version !== runningVersion || !isIsoTimestamp(record.updatedAt)) return { version: runningVersion, updatedAt: "" };
    return { version: runningVersion, updatedAt: record.updatedAt };
  } catch {
    return { version: runningVersion, updatedAt: "" };
  }
}
