import type { SearchState, Tab, TabGroup } from "./types.js";

export type TabDock = "left" | "right" | "top" | "bottom";
export class TabStore {
  private tabs: Tab[] = [];
  private groups: TabGroup[] = [];
  private dock: TabDock = "left";
  add(tab: Tab): void { if (this.tabs.some(item => item.id === tab.id)) throw new Error("Duplicate tab id"); this.tabs.push({ ...tab }); }
  addGroup(group: TabGroup): void { if (this.groups.some(item => item.id === group.id)) throw new Error("Duplicate group id"); this.groups.push({ ...group }); }
  moveToGroup(tabId: string, groupId: string | undefined): void { const tab = this.tabs.find(item => item.id === tabId); if (!tab) throw new Error("Unknown tab"); if (groupId && !this.groups.some(item => item.id === groupId)) throw new Error("Unknown group"); tab.groupId = groupId; }
  setDock(dock: TabDock): void { this.dock = dock; }
  getDock(): TabDock { return this.dock; }
  list(): Tab[] { return this.tabs.map(tab => ({ ...tab })); }
  listGroups(): TabGroup[] { return this.groups.map(group => ({ ...group })); }
  search(state: SearchState, scope: "strip" | "group" | "groups" | "master", groupId?: string): Tab[] | TabGroup[] {
    const matcher = compileSearch(state);
    if (scope === "groups") return this.groups.filter(group => matcher(group.name)).map(group => ({ ...group }));
    return this.tabs.filter(tab => (!groupId || tab.groupId === groupId) && matcher(tab.title)).map(tab => ({ ...tab }));
  }
  closeByText(query: string, includePinned = false, invert = false): Tab[] {
    if (!query.trim()) throw new Error("A non-empty query is required");
    const matched = this.tabs.filter(tab => (includePinned || !tab.pinned) && (invert ? !tab.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) : tab.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && tab.closable && !tab.locked);
    this.tabs = this.tabs.filter(tab => !matched.some(item => item.id === tab.id)); return matched.map(tab => ({ ...tab }));
  }
}

export function compileSearch(state: SearchState): (value: string) => boolean {
  if (!state.regex) { const needle = state.query.toLocaleLowerCase(); return value => value.toLocaleLowerCase().includes(needle); }
  if (!state.pattern) throw new Error("Regex pattern cannot be empty");
  let expression: RegExp; try { expression = new RegExp(state.pattern, state.flags); } catch (error) { throw new Error(`Invalid regular expression: ${error instanceof Error ? error.message : "unknown error"}`); }
  return value => { if (expression.global || expression.sticky) expression.lastIndex = 0; return expression.test(value); };
}

export interface RegexWorkbench { engine: string; version: string; dialect: string; supportedFlags: readonly string[]; capabilities: Readonly<Record<string, boolean>>; explain(pattern: string): string; test(pattern: string, sample: string, flags?: string): { matches: boolean; captures: string[] }; }
export const regexWorkbench: RegexWorkbench = {
  engine: "ECMAScript RegExp", version: "runtime", dialect: "ECMAScript", supportedFlags: ["d", "g", "i", "m", "s", "u", "v", "y"],
  capabilities: { literals: true, classes: true, captures: true, namedCaptures: true, lookahead: true, lookbehind: true, backreferences: true, conditionals: false, subroutines: false, atomicGroups: false, possessiveQuantifiers: false },
  explain: pattern => pattern.length ? `Pattern has ${[...pattern].length} code points; evaluation is bounded by the caller.` : "Empty pattern matches nothing until a query is supplied.",
  test: (pattern, sample, flags = "") => { const expression = new RegExp(pattern, flags); const match = expression.exec(sample); return { matches: Boolean(match), captures: match?.slice(1) ?? [] }; }
};
