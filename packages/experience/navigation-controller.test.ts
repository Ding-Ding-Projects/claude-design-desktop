import assert from "node:assert/strict";
import test from "node:test";
import { applyBulkClose, applyRegexToSearch, bulkClosePreview, createGroup, createNavigationState, moveTabToGroup, reorderTab, searchGroups, searchTabs, setDock, setTabPinned, toggleGroupCollapsed, updateSearch, validateNavigationContract, visibleTabs } from "./navigation-controller";
import { createRegexWorkbench, setRegexInput } from "./regex-workbench";
import { createAppearance, deserializeAppearance, loadAppearance, rainbowCss, saveAppearance, setAppearanceProperty, setColor, translateHex, undoAppearance } from "./appearance-model";
import { createContextMenu, filterContextActions } from "./context-menu";
import { createPaletteState, filterCommands, filterCommandsBySearch, openPalette, teleportTarget } from "./command-palette";

const tabs = [
  { id: "one", label: "Home", pinned: true, page: "home", order: 0 },
  { id: "two", label: "Notes", title: "Work notes", pinned: false, page: "notes", order: 1 },
  { id: "three", label: "Settings", pinned: false, dirty: true, page: "settings", order: 2 }
];

test("navigation supports all dock edges, pinning, reorder and overflow", () => {
  let state = createNavigationState(tabs);
  for (const dock of ["left", "right", "top", "bottom"] as const) assert.equal(setDock(state, dock).dock, dock);
  state = setTabPinned(state, "two", true);
  assert.deepEqual(state.tabs.slice(0, 2).map((tab) => tab.id), ["one", "two"]);
  state = reorderTab(state, "three", 0);
  assert.equal(state.tabs[0].id, "three");
  const result = visibleTabs(state, 160, 160);
  assert.equal(result.visible.length, 2);
  assert.equal(result.overflow.length, 1);
});

test("groups collapse and move picker state preserves membership", () => {
  let state = createGroup(createNavigationState(tabs), "Work", "#006A6A");
  const group = state.groups[0];
  state = moveTabToGroup(state, "two", group.id);
  assert.equal(state.tabs.find((tab) => tab.id === "two")?.groupId, group.id);
  state = toggleGroupCollapsed(state, group.id);
  assert.equal(state.groups[0].collapsed, true);
  assert.deepEqual(state.expandedGroupIds, []);
});

test("four searches remain isolated and regex matching is explicit", () => {
  let state = createNavigationState(tabs);
  state = updateSearch(state, "strip", { query: "^N", pattern: "^N", mode: "regex" });
  state = updateSearch(state, "all", { query: "Settings" });
  assert.equal(searchTabs(state, "strip").length, 1);
  assert.equal(searchTabs(state, "all").length, 1);
  assert.equal(state.searches.group.query, "");
  state = createGroup(state, "Writing");
  state = updateSearch(state, "groups", { query: "Writing" });
  assert.equal(searchGroups(state).length, 1);
  state = applyRegexToSearch(state, "groups", "^W", "", true);
  assert.equal(searchGroups(state).length, 1);
});

test("bulk close previews protect pinned, dirty and empty-query tabs", () => {
  const state = createNavigationState(tabs);
  assert.equal(bulkClosePreview(state, "contains", "").canApply, false);
  const preview = bulkClosePreview(state, "contains", "e");
  assert.equal(preview.canApply, true);
  assert.ok(preview.excluded.some((item) => item.reason.includes("Pinned")));
  assert.equal(applyBulkClose(state, preview, true).tabs.length, 2);
  const allowed = bulkClosePreview(state, "contains", "Notes");
  assert.equal(allowed.matches.length, 1);
  assert.equal(applyBulkClose(state, allowed, true).tabs.some((tab) => tab.id === "two"), false);
});

test("regex workbench reports capabilities, captures, replacement and risk", () => {
  let state = createRegexWorkbench("(?<word>foo)+", "foo foo");
  state = setRegexInput(state, { mode: "regex", flags: "g", replacement: "$<word>!" });
  assert.equal(state.valid, true);
  assert.ok(state.capabilities.some((capability) => capability.name === "atomic groups" && !capability.supported));
  assert.equal(state.matches.length, 2);
  assert.ok(state.tokens.length > 0);
  assert.equal(state.replacementPreview, "foo! foo!");
});

test("appearance model is reversible, stateful, portable and rainbow-aware", () => {
  let state = createAppearance("button");
  state = setAppearanceProperty(state, "radius", 24, "hover");
  state = setColor(state, { sentinel: "rainbow", speedLevel: 3 });
  const prior = undoAppearance(state);
  assert.equal(prior.color && "sentinel" in prior.color, false);
  assert.match(rainbowCss(3), /linear-gradient/);
  assert.equal(deserializeAppearance(JSON.stringify({ schemaVersion: 1, appearance: state }), "button").elementId, "button");
  assert.throws(() => deserializeAppearance(JSON.stringify({ schemaVersion: 2, appearance: state }), "button"));
  assert.equal(translateHex("6750A4").hex, "#6750A4");
  const memory = new Map<string, string>();
  const storage = { setItem: (key: string, value: string) => memory.set(key, value), getItem: (key: string) => memory.get(key) || null };
  saveAppearance(storage, "button", state);
  assert.equal(loadAppearance(storage, "button", "button")?.elementId, "button");
});

test("palette and context menus expose rich teleport and keyboard paths", () => {
  const commands = [{ id: "settings", label: "Open settings", kind: "destination" as const, tabId: "settings", groupId: "general", elementId: "settings-panel" }];
  assert.equal(filterCommands(commands, "settings").length, 1);
  assert.equal(filterCommandsBySearch(commands, { query: "^Open", pattern: "^Open", flags: "", mode: "regex", valid: true }).length, 1);
  assert.deepEqual(teleportTarget(commands[0]), { tabId: "settings", groupId: "general", elementId: "settings-panel" });
  assert.equal(openPalette(createPaletteState()).open, true);
  const menu = filterContextActions(createContextMenu("button", "Save", "Ctrl+S"), "appearance");
  assert.equal(menu.actions[0].id, "edit-appearance");
  assert.equal(menu.actions.some((action) => action.id === "lock-element"), false);
});

test("negative regression inventory stays fail-closed", () => {
  const required = ["strip", "group", "groups", "all"] as const;
  const state = createNavigationState();
  for (const scope of required) assert.ok(Object.prototype.hasOwnProperty.call(state.searches, scope), `missing search scope: ${scope}`);
  const menu = createContextMenu("target", "Target");
  assert.ok(menu.actions.some((action) => action.id === "edit-appearance"));
  assert.ok(menu.actions.some((action) => action.id === "lock-element"));
  validateNavigationContract(state);
  const broken = { ...state, searches: { ...state.searches, all: undefined } } as unknown as typeof state;
  assert.throws(() => validateNavigationContract(broken), /all/);
});
