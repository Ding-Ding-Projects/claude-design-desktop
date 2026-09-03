export type WindowBounds = { x: number; y: number; width: number; height: number };
export type PersistedState = { version: 1; bounds?: WindowBounds; maximized: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isBounds(value: unknown): value is WindowBounds {
  if (!isRecord(value) || Object.keys(value).length !== 4) return false;
  const validNumbers = ["x", "y", "width", "height"].every((key) => isFiniteInteger(value[key]));
  return validNumbers && (value.width as number) > 0 && (value.height as number) > 0;
}

export function parsePersistedState(value: unknown): PersistedState {
  if (!isRecord(value) || value.version !== 1 || typeof value.maximized !== "boolean") return { version: 1, maximized: false };
  if (Object.keys(value).some((key) => key !== "version" && key !== "maximized" && key !== "bounds")) return { version: 1, maximized: false };
  if (value.bounds !== undefined && !isBounds(value.bounds)) return { version: 1, maximized: false };
  return { version: 1, maximized: value.maximized, bounds: value.bounds };
}
