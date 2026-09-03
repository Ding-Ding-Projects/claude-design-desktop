import type { SearchScope, SearchState, Tab, TabDock, TabGroup } from "./types";

export type NavigationState = {
  dock: TabDock;
  tabs: Tab[];
  groups: TabGroup[];
  activeTabId?: string;
  searches: Record<SearchScope, SearchState>;
  expandedGroupIds: string[];
};

export type BulkClosePreview = {
  mode: "contains" | "not-contains";
  query: string;
  includePinned: boolean;
  matches: Tab[];
  excluded: Array<{ tab: Tab; reason: string }>;
  canApply: boolean;
};

const emptySearch = (): SearchState => ({ query: "", pattern: "", flags: "", mode: "text", valid: true });

export function createNavigationState(tabs: Tab[] = [], groups: TabGroup[] = []): NavigationState {
  return {
    dock: "left",
    tabs: tabs.map((tab, index) => ({ ...tab, order: index })),
    groups: groups.map((group, index) => ({ ...group, order: index })),
    activeTabId: tabs[0]?.id,
    searches: { strip: emptySearch(), group: emptySearch(), groups: emptySearch(), all: emptySearch() },
    expandedGroupIds: groups.filter((group) => !group.collapsed).map((group) => group.id)
  };
}

export function setDock(state: NavigationState, dock: TabDock): NavigationState {
  return { ...state, dock };
}

export function reorderTab(state: NavigationState, tabId: string, destinationIndex: number): NavigationState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return state;
  const tabs = state.tabs.slice();
  const [tab] = tabs.splice(index, 1);
  const pinnedCount = tabs.filter((item) => item.pinned).length;
  const lower = tab.pinned ? 0 : pinnedCount;
  const upper = tab.pinned ? pinnedCount : tabs.length;
  const clamped = Math.max(lower, Math.min(destinationIndex, upper));
  tabs.splice(clamped, 0, tab);
  return { ...state, tabs: tabs.map((item, order) => ({ ...item, order })) };
}

export function focusBoundary(state: NavigationState, direction: "home" | "end"): NavigationState {
  const ordered = state.tabs.slice().sort((a, b) => a.order - b.order);
  return { ...state, activeTabId: ordered[direction === "home" ? 0 : ordered.length - 1]?.id };
}

export function setTabPinned(state: NavigationState, tabId: string, pinned: boolean): NavigationState {
  const tabs = state.tabs.map((tab) => (tab.id === tabId ? { ...tab, pinned } : tab));
  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const regularTabs = tabs.filter((tab) => !tab.pinned);
  return { ...state, tabs: [...pinnedTabs, ...regularTabs].map((tab, order) => ({ ...tab, order })) };
}

export function toggleGroupCollapsed(state: NavigationState, groupId: string): NavigationState {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return state;
  const groups = state.groups.map((item) => item.id === groupId ? { ...item, collapsed: !item.collapsed } : item);
  const expandedGroupIds = groups.filter((item) => !item.collapsed).map((item) => item.id);
  return { ...state, groups, expandedGroupIds };
}

export function moveTabToGroup(state: NavigationState, tabId: string, groupId?: string): NavigationState {
  if (groupId && !state.groups.some((group) => group.id === groupId)) return state;
  return { ...state, tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, groupId } : tab) };
}

export function createGroup(state: NavigationState, name: string, color = "#6750A4"): NavigationState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const id = `group-${state.groups.length + 1}-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const group: TabGroup = { id, name: trimmed, color, collapsed: false, pinned: false, order: state.groups.length };
  return { ...state, groups: [...state.groups, group], expandedGroupIds: [...state.expandedGroupIds, id] };
}

export function updateSearch(state: NavigationState, scope: SearchScope, next: Partial<SearchState>): NavigationState {
  const search = { ...state.searches[scope], ...next };
  if (search.mode === "regex") {
    try {
      new RegExp(search.pattern || search.query, search.flags);
      search.valid = true;
      search.error = undefined;
    } catch (error) {
      search.valid = false;
      search.error = error instanceof Error ? error.message : "Invalid regular expression";
    }
  } else {
    search.valid = true;
    search.error = undefined;
  }
  return { ...state, searches: { ...state.searches, [scope]: search } };
}

export function visibleTabs(state: NavigationState, widthPx: number, estimatedTabWidthPx = 160): { visible: Tab[]; overflow: Tab[] } {
  const available = Math.max(0, Math.floor(widthPx / Math.max(1, estimatedTabWidthPx)));
  const pinned = state.tabs.filter((tab) => tab.pinned);
  const regular = state.tabs.filter((tab) => !tab.pinned && (!tab.groupId || state.expandedGroupIds.includes(tab.groupId)));
  const slots = Math.max(0, available - pinned.length);
  return { visible: [...pinned, ...regular.slice(0, slots)], overflow: regular.slice(slots) };
}

function matchesTab(tab: Tab, search: SearchState): boolean {
  const haystack = `${tab.label} ${tab.title || ""}`;
  if (!search.query && !search.pattern) return false;
  if (search.mode === "text") return haystack.toLocaleLowerCase().includes(search.query.toLocaleLowerCase());
  if (!search.valid) return false;
  try {
    return new RegExp(search.pattern || search.query, search.flags).test(haystack);
  } catch {
    return false;
  }
}

export function searchTabs(state: NavigationState, scope: SearchScope, groupId?: string): Tab[] {
  const search = state.searches[scope];
  const source = scope === "group" ? state.tabs.filter((tab) => tab.groupId === groupId) : scope === "groups" ? [] : state.tabs;
  return source.filter((tab) => matchesTab(tab, search));
}

export function searchGroups(state: NavigationState): TabGroup[] {
  const search = state.searches.groups;
  return state.groups.filter((group) => matchesTab({ id: group.id, label: group.name, title: group.name, pinned: group.pinned, page: "group", order: group.order }, search));
}

export function applyRegexToSearch(state: NavigationState, scope: SearchScope, pattern: string, flags: string, valid: boolean, error?: string): NavigationState {
  return { ...state, searches: { ...state.searches, [scope]: { ...state.searches[scope], pattern, flags, mode: "regex", valid, error } } };
}

export function bulkClosePreview(
  state: NavigationState,
  mode: "contains" | "not-contains",
  query: string,
  includePinned = false,
  includeLocked = false
): BulkClosePreview {
  const trimmed = query.trim();
  if (!trimmed) return { mode, query, includePinned, matches: [], excluded: [], canApply: false };
  const search = state.searches.strip;
  const candidate = state.tabs.filter((tab) => {
    const found = search.mode === "regex" ? matchesTab(tab, { ...search, query: trimmed, pattern: search.pattern || trimmed }) : `${tab.label} ${tab.title || ""}`.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase());
    return mode === "contains" ? found : !found;
  });
  const matches: Tab[] = [];
  const excluded: BulkClosePreview["excluded"] = [];
  for (const tab of candidate) {
    if (tab.pinned && !includePinned) excluded.push({ tab, reason: "Pinned tabs are excluded by default" });
    else if (tab.locked && !includeLocked) excluded.push({ tab, reason: "Locked tabs require explicit inclusion" });
    else if (tab.dirty) excluded.push({ tab, reason: "Unsaved changes require individual review" });
    else matches.push(tab);
  }
  return { mode, query: trimmed, includePinned, matches, excluded, canApply: matches.length > 0 };
}

export function applyBulkClose(state: NavigationState, preview: BulkClosePreview, confirmed: boolean): NavigationState {
  if (!confirmed || !preview.canApply) return state;
  const ids = new Set(preview.matches.map((tab) => tab.id));
  const tabs = state.tabs.filter((tab) => !ids.has(tab.id)).map((tab, order) => ({ ...tab, order }));
  return { ...state, tabs, activeTabId: state.activeTabId && ids.has(state.activeTabId) ? tabs[0]?.id : state.activeTabId };
}

/** Fail-closed inventory for the navigation surface. It is intentionally explicit so a missing search or action cannot disappear from coverage. */
export function validateNavigationContract(state: NavigationState): void {
  for (const scope of ["strip", "group", "groups", "all"] as const) {
    if (!state.searches[scope]) throw new Error(`Missing required search scope: ${scope}`);
  }
  if (!state.tabs.every((tab) => typeof tab.id === "string" && typeof tab.label === "string")) throw new Error("Every tab needs an id and visible label");
  if (!state.groups.every((group) => typeof group.id === "string" && typeof group.name === "string")) throw new Error("Every group needs an id and visible name");
}
