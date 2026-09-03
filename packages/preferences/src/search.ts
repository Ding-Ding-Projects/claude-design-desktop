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
    registry.register({ id, scope, builder: { id: `${id}-regex-workbench`, anchor: id, plainTextDefault: true, maxPatternLength: MAX_REGEX_PATTERN_LENGTH, maxSampleLength: MAX_REGEX_SAMPLE_LENGTH, flags: "dgimsuvy" } });
  }
}

export function compileBoundedSearch(query: string, regexEnabled = false, flags = ""): RegExp | null {
  if (query.length > MAX_REGEX_PATTERN_LENGTH) throw new Error("search-query-too-large");
  if (!regexEnabled) return query.length ? new RegExp(escapeRegExp(query), "iu") : null;
  if (flags.length > 12 || /[^dgimsuvy]/.test(flags)) throw new Error("unsupported-regex-flags");
  return query.length ? new RegExp(query, flags) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
