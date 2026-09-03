export const MAX_SEARCH_QUERY_LENGTH = 2_048;
export const MAX_REGEX_PATTERN_LENGTH = 4_096;
export const MAX_REGEX_SAMPLE_LENGTH = 16_384;

export interface RegexWorkbenchRegistration {
  id: string;
  anchor: string;
  plainTextDefault: true;
  maxPatternLength: number;
  maxSampleLength: number;
  flags: string;
}

export interface SearchSurfaceRegistration {
  id: string;
  scope: string;
  builder: RegexWorkbenchRegistration;
}

export function createSearchRegistry() {
  const surfaces = new Map<string, SearchSurfaceRegistration>();
  return {
    register(surface: SearchSurfaceRegistration) {
      if (!surface.id || !surface.builder.id || surface.builder.anchor !== surface.id) throw new Error("search-builder-must-be-anchored");
      if (surface.builder.maxPatternLength > MAX_REGEX_PATTERN_LENGTH || surface.builder.maxSampleLength > MAX_REGEX_SAMPLE_LENGTH) throw new Error("regex-bounds-too-large");
      if (!surface.builder.plainTextDefault) throw new Error("plain-text-search-must-be-default");
      surfaces.set(surface.id, surface);
    },
    list() { return [...surfaces.values()]; },
    get(id: string) { return surfaces.get(id); }
  };
}

export function registerPreferenceSearchSurfaces(registry: ReturnType<typeof createSearchRegistry>): void {
  for (const [id, scope] of [["settings", "all preference controls"], ["voice-picker", "installed voice choices"], ["schedule-source-picker", "local and external schedule sources"], ["menu", "preference actions"]] as const) {
    registry.register({ id, scope, builder: { id: `${id}-regex-workbench`, anchor: id, plainTextDefault: true, maxPatternLength: MAX_REGEX_PATTERN_LENGTH, maxSampleLength: MAX_REGEX_SAMPLE_LENGTH, flags: "dgimsuy" } });
  }
}

export function compileBoundedSearch(query: string, regexEnabled = false, flags = ""): RegExp | null {
  if (query.length > MAX_REGEX_PATTERN_LENGTH) throw new Error("search-query-too-large");
  if (!regexEnabled) return query.length ? new RegExp(escapeRegExp(query), "iu") : null;
  if (flags.length > 12 || /[^dgimsuy]/.test(flags)) throw new Error("unsupported-regex-flags");
  return query.length ? new RegExp(query, flags) : null;
}

export interface BoundedRegexEvaluation {
  matched: boolean;
  elapsedMs: number;
  timedOut: boolean;
}

export async function evaluateBoundedSearch(query: string, sample: string, regexEnabled = false, flags = "", deadlineMs = 100): Promise<BoundedRegexEvaluation> {
  if (sample.length > MAX_REGEX_SAMPLE_LENGTH) throw new Error("regex-sample-too-large");
  const expression = compileBoundedSearch(query, regexEnabled, flags);
  if (!expression) return { matched: false, elapsedMs: 0, timedOut: false };
  const started = Date.now();
  try {
    const matched = await evaluateInWorker(expression.source, sample, expression.flags, deadlineMs);
    return { matched, elapsedMs: Date.now() - started, timedOut: false };
  } catch (error) {
    if (error instanceof Error && error.message === "regex-worker-timeout") return { matched: false, elapsedMs: Date.now() - started, timedOut: true };
    throw error;
  }
}

async function evaluateInWorker(pattern: string, sample: string, flags: string, deadlineMs: number): Promise<boolean> {
  let workerModule: typeof import("node:worker_threads");
  try { workerModule = await import("node:worker_threads"); }
  catch { throw new Error("regex-worker-unavailable"); }
  const worker = new workerModule.Worker("const { parentPort } = require('node:worker_threads'); parentPort.on('message', ({ pattern, sample, flags }) => parentPort.postMessage(new RegExp(pattern, flags).test(sample)));", { eval: true });
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; void worker.terminate(); reject(new Error("regex-worker-timeout")); } }, Math.max(1, Math.min(5_000, deadlineMs)));
    worker.once("message", (matched: boolean) => { if (!settled) { settled = true; clearTimeout(timer); void worker.terminate(); resolve(matched); } });
    worker.once("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); void worker.terminate(); reject(error); } });
    worker.postMessage({ pattern, sample, flags });
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
