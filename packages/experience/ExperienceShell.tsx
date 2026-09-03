import React, { useMemo, useState } from "react";
import { applyBulkClose, bulkClosePreview, createNavigationState, moveTabToGroup, reorderTab, searchTabs, setDock, setTabPinned, toggleGroupCollapsed, updateSearch, createGroup, type NavigationState } from "./navigation-controller";
import { createAppearance, rainbowCss, setAppearanceProperty, setColor, setTypography, translateHex, undoAppearance, redoAppearance, serializeAppearance, deserializeAppearance } from "./appearance-model";
import { addRegexTest, createRegexWorkbench, runRegexTests, saveRegexSnippet, setRegexInput } from "./regex-workbench";
import { createPaletteState, filterCommands, openPalette, closePalette, setPaletteQuery, setPaletteSize, teleportTarget, type PaletteState } from "./command-palette";
import { createContextMenu, filterContextActions } from "./context-menu";
import type { CommandDescriptor, ElementAppearance, SearchScope, Tab, TabGroup } from "./types";

export type ExperienceShellProps = {
  initialTabs: Tab[];
  initialGroups?: TabGroup[];
  onTeleport?: (target: ReturnType<typeof teleportTarget>) => void;
};

const scopes: Array<{ id: SearchScope; label: string }> = [
  { id: "strip", label: "Current tab strip" },
  { id: "group", label: "Tabs in group" },
  { id: "groups", label: "Tab groups" },
  { id: "all", label: "All open tabs" }
];

export function ExperienceShell({ initialTabs, initialGroups = [], onTeleport }: ExperienceShellProps): React.ReactElement {
  const [navigation, setNavigation] = useState<NavigationState>(() => createNavigationState(initialTabs, initialGroups));
  const [palette, setPalette] = useState<PaletteState>(() => createPaletteState());
  const [appearance, setAppearance] = useState<ElementAppearance>(() => createAppearance("experience-shell"));
  const [regex, setRegex] = useState(() => createRegexWorkbench());
  const [activeRegexScope, setActiveRegexScope] = useState<SearchScope | "appearance" | "palette" | "menu">("strip");
  const [menuTarget, setMenuTarget] = useState<string>();
  const [menuQuery, setMenuQuery] = useState("");
  const [movePickerTabId, setMovePickerTabId] = useState<string>();
  const [movePickerQuery, setMovePickerQuery] = useState("");
  const [bulkMode, setBulkMode] = useState<"contains" | "not-contains">("contains");
  const [bulkQuery, setBulkQuery] = useState("");
  const [includePinned, setIncludePinned] = useState(false);
  const [status, setStatus] = useState("Ready");

  const commands = useMemo<CommandDescriptor[]>(() => [
    { id: "command-settings", label: "Open settings", kind: "destination", tabId: "settings" },
    ...navigation.tabs.map((tab) => ({ id: `tab-${tab.id}`, label: `Open ${tab.label}`, kind: "destination" as const, tabId: tab.id, groupId: tab.groupId })),
    { id: "appearance-shell", label: "Edit shell appearance", kind: "appearance", tabId: navigation.activeTabId, elementId: "experience-shell" },
    { id: "dock-left", label: "Dock tabs left", kind: "setting", value: "left" },
    { id: "dock-right", label: "Dock tabs right", kind: "setting", value: "right" },
    { id: "dock-top", label: "Dock tabs top", kind: "setting", value: "top" },
    { id: "dock-bottom", label: "Dock tabs bottom", kind: "setting", value: "bottom" }
  ], [navigation.tabs, navigation.activeTabId]);

  const preview = bulkClosePreview(navigation, bulkMode, bulkQuery, includePinned);
  const currentMenu = menuTarget ? filterContextActions(createContextMenu(menuTarget, navigation.tabs.find((tab) => tab.id === menuTarget)?.label || menuTarget), menuQuery) : undefined;

  function handlePaletteKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") setPalette(closePalette(palette));
    if (event.key === "Enter") {
      const command = filterCommands(commands, palette.query)[0];
      if (!command) return;
      if (command.kind === "setting" && command.value) setNavigation(setDock(navigation, command.value as NavigationState["dock"]));
      onTeleport?.(teleportTarget(command));
      setStatus(`Moved to ${command.label}`);
      setPalette(closePalette(palette));
    }
  }

  function openRegex(scope: typeof activeRegexScope): void {
    setActiveRegexScope(scope);
    setRegexInput(regex, { mode: "regex" });
  }

  function handleScopeSearch(scope: SearchScope, value: string): void {
    setNavigation(updateSearch(navigation, scope, { query: value, pattern: value }));
    setRegexInput(regex, { sample: navigation.tabs.map((tab) => tab.label).join("\n") });
  }

  return <main className={`experience-shell dock-${navigation.dock}`} onContextMenu={(event) => { event.preventDefault(); setMenuTarget("experience-shell"); }}>
    <header className="experience-toolbar">
      <button type="button" aria-label="Open command palette" onClick={() => setPalette(openPalette(palette))}>Command palette <kbd>Ctrl+Shift+F</kbd></button>
      <label>Dock tabs<select aria-label="Tab strip position" value={navigation.dock} onChange={(event) => setNavigation(setDock(navigation, event.target.value as NavigationState["dock"]))}><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
      <button type="button" onClick={() => setAppearance(setAppearanceProperty(appearance, "outline", "1px solid #6750A4"))}>Edit appearance…</button>
      <span role="status" aria-live="polite">{status}</span>
    </header>

    <nav className="tab-strip" aria-label="Browser tabs" role="tablist" aria-orientation={navigation.dock === "left" || navigation.dock === "right" ? "vertical" : "horizontal"}>
      {navigation.groups.map((group) => <section key={group.id} className="tab-group" aria-label={group.name}>
        <button type="button" className="group-header" aria-expanded={!group.collapsed} onClick={() => setNavigation(toggleGroupCollapsed(navigation, group.id))}>{group.name} <span>{group.collapsed ? "Collapsed" : "Expanded"}</span></button>
        {!group.collapsed && navigation.tabs.filter((tab) => tab.groupId === group.id).map((tab) => <TabButton key={tab.id} tab={tab} active={navigation.activeTabId === tab.id} onSelect={() => setNavigation({ ...navigation, activeTabId: tab.id })} onPin={() => setNavigation(setTabPinned(navigation, tab.id, !tab.pinned))} onMove={() => { setMovePickerTabId(tab.id); setMovePickerQuery(""); }} onDragEnd={(destination) => setNavigation(reorderTab(navigation, tab.id, destination))} />)}
      </section>)}
      {navigation.tabs.filter((tab) => !tab.groupId).map((tab) => <TabButton key={tab.id} tab={tab} active={navigation.activeTabId === tab.id} onSelect={() => setNavigation({ ...navigation, activeTabId: tab.id })} onPin={() => setNavigation(setTabPinned(navigation, tab.id, !tab.pinned))} onMove={() => { setMovePickerTabId(tab.id); setMovePickerQuery(""); }} onDragEnd={(destination) => setNavigation(reorderTab(navigation, tab.id, destination))} />)}
      <button type="button" aria-label="Show overflow tabs" onClick={() => setStatus(`${navigation.tabs.length} tabs, ${navigation.tabs.filter((tab) => !navigation.expandedGroupIds.includes(tab.groupId || "") && tab.groupId).length} collapsed`)}>More tabs…</button>
    </nav>

    <section className="tab-searches" aria-label="Tab discovery searches">
      {scopes.map(({ id, label }) => <div className="search-row" key={id}><label htmlFor={`search-${id}`}>{label}</label><input id={`search-${id}`} value={navigation.searches[id].query} onChange={(event) => handleScopeSearch(id, event.target.value)} /><button type="button" aria-label={`Open regex builder for ${label}`} onClick={() => openRegex(id)}>Regex…</button><output>{id === "group" ? searchTabs(navigation, id, navigation.groups[0]?.id).length : searchTabs(navigation, id).length} matches</output></div>)}
      <button type="button" onClick={() => setNavigation(createGroup(navigation, "New group"))}>Create group</button>
    </section>

    <section className="bulk-close" aria-label="Bulk close tabs"><h2>Bulk close preview</h2><select aria-label="Bulk close mode" value={bulkMode} onChange={(event) => setBulkMode(event.target.value as typeof bulkMode)}><option value="contains">Close tabs containing text</option><option value="not-contains">Close tabs not containing text</option></select><input aria-label="Bulk close text" value={bulkQuery} onChange={(event) => setBulkQuery(event.target.value)} /><button type="button" onClick={() => openRegex("strip")}>Regex…</button><label><input type="checkbox" checked={includePinned} onChange={(event) => setIncludePinned(event.target.checked)} /> Include pinned tabs</label><p>{preview.matches.length} tabs will close, {preview.excluded.length} excluded.</p><button type="button" disabled={!preview.canApply} onClick={() => { setNavigation(applyBulkClose(navigation, preview, true)); setStatus(`Closed ${preview.matches.length} tabs`); }}>Review and close</button></section>

    <section className="appearance-editor" aria-label="Appearance editor"><h2>Appearance editor</h2><p>Editing: {appearance.elementId}. Changes are reversible and scoped to this element.</p><button type="button" onClick={() => setAppearance(undoAppearance(appearance))}>Undo</button><button type="button" onClick={() => setAppearance(redoAppearance(appearance))}>Redo</button><button type="button" onClick={() => setAppearance(setTypography(appearance, { weight: appearance.typography.weight === 400 ? 700 : 400 }))}>Toggle weight</button><button type="button" onClick={() => setAppearance(setColor(appearance, translateHex("#6750A4")))}>Use translated color</button><button type="button" onClick={() => setAppearance(setColor(appearance, { sentinel: "rainbow", speedLevel: 3 }))}>Rainbow</button><code>{appearance.color && "sentinel" in appearance.color ? rainbowCss(appearance.color.speedLevel) : serializeAppearance(appearance).slice(0, 80)}</code><button type="button" onClick={() => { const restored = deserializeAppearance(serializeAppearance(appearance), appearance.elementId); setAppearance(restored); setStatus("Appearance export round-tripped"); }}>Export/import round trip</button></section>

    {movePickerTabId && <aside className="move-picker" aria-label="Move tab into group"><h2>Move tab into group</h2><p>{navigation.tabs.find((tab) => tab.id === movePickerTabId)?.label || "Tab"}</p><label>Search groups<input autoFocus value={movePickerQuery} onChange={(event) => setMovePickerQuery(event.target.value)} /></label><button type="button" onClick={() => openRegex("group")}>Regex…</button><ul>{navigation.groups.filter((group) => group.name.toLocaleLowerCase().includes(movePickerQuery.toLocaleLowerCase())).map((group) => <li key={group.id}><button type="button" onClick={() => { setNavigation(moveTabToGroup(navigation, movePickerTabId, group.id)); setMovePickerTabId(undefined); }}>{group.name} · {navigation.tabs.filter((tab) => tab.groupId === group.id).length} tabs</button></li>)}</ul><button type="button" onClick={() => { const next = createGroup(navigation, "New group"); setNavigation(moveTabToGroup(next, movePickerTabId, next.groups.at(-1)?.id)); setMovePickerTabId(undefined); }}>Create new group</button><button type="button" onClick={() => setMovePickerTabId(undefined)}>Cancel</button></aside>}

    {activeRegexScope && <aside className="regex-workbench" aria-label="Advanced regex workbench"><h2>Advanced regex workbench</h2><p>{regex.engine} · {regex.dialect} · {regex.engineVersion}</p><label>Pattern<input value={regex.pattern} onChange={(event) => setRegex(setRegexInput(regex, { pattern: event.target.value }))} /></label><label>Flags<input value={regex.flags} onChange={(event) => setRegex(setRegexInput(regex, { flags: event.target.value }))} /></label><label>Sample<textarea value={regex.sample} onChange={(event) => setRegex(setRegexInput(regex, { sample: event.target.value }))} /></label><label>Replacement<input value={regex.replacement} onChange={(event) => setRegex(setRegexInput(regex, { replacement: event.target.value }))} /></label><p role="status">{regex.valid ? regex.explanation : regex.error}</p><p>Risk: {regex.performance.risk}; {regex.performance.matchCount} matches in {regex.performance.elapsedMs}ms.</p><ul>{regex.capabilities.map((capability) => <li key={capability.name}>{capability.name}: {capability.supported ? "supported" : capability.explanation}</li>)}</ul><button type="button" onClick={() => setRegex(runRegexTests(addRegexTest(regex, regex.sample, regex.matches.length > 0)))}>Run test</button><button type="button" onClick={() => setRegex(saveRegexSnippet(regex, "Current pattern"))}>Save snippet</button><details><summary>Structured trace and captures</summary><pre>{JSON.stringify({ tokens: regex.tokens, matches: regex.matches, trace: regex.trace, replacement: regex.replacementPreview }, null, 2)}</pre></details></aside>}

    {currentMenu && <aside className="context-menu" aria-label={`Actions for ${currentMenu.accessibleName}`}><input autoFocus aria-label="Filter context actions" value={menuQuery} onChange={(event) => setMenuQuery(event.target.value)} /><p>Keyboard: {currentMenu.keyboardEquivalent}. Touch: {currentMenu.touchEquivalent}.</p>{currentMenu.actions.map((action) => <button type="button" key={action.id} onClick={() => { if (action.id === "edit-appearance") setStatus(`Editing ${currentMenu.accessibleName}`); setMenuTarget(undefined); setMenuQuery(""); }}>{action.label}{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>)}</aside>}

    {palette.open && <aside className={`command-palette ${palette.size}`} aria-label="Command palette"><input autoFocus aria-label="Search commands" value={palette.query} onChange={(event) => setPalette(setPaletteQuery(palette, event.target.value, commands))} onKeyDown={handlePaletteKeyDown} /><button type="button" onClick={() => setPalette(setPaletteSize(palette, palette.size === "card" ? "window" : "card"))}>Resize palette</button><button type="button" onClick={() => setPalette(closePalette(palette))}>Close</button><ul>{filterCommands(commands, palette.query).map((command) => <li key={command.id}><button type="button" onClick={() => { onTeleport?.(teleportTarget(command)); setPalette(closePalette(palette)); }}>{command.label}{command.value !== undefined && <select aria-label={`Change ${command.label}`} value={String(command.value)} onChange={(event) => setNavigation(setDock(navigation, event.target.value as NavigationState["dock"]))}><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select>}</button></li>)}</ul></aside>}
  </main>;
}

function TabButton({ tab, active, onSelect, onPin, onMove, onDragEnd }: { tab: Tab; active: boolean; onSelect: () => void; onPin: () => void; onMove: () => void; onDragEnd: (index: number) => void }): React.ReactElement {
  return <div className={`tab-item ${tab.pinned ? "pinned" : ""}`} onContextMenu={(event) => event.preventDefault()}><button type="button" role="tab" aria-selected={active} aria-label={`${tab.label}${tab.pinned ? ", pinned" : ""}${tab.locked ? ", locked" : ""}`} onClick={onSelect}>{tab.label}</button><button type="button" aria-label={`${tab.pinned ? "Unpin" : "Pin"} ${tab.label}`} onClick={onPin}>📌</button><button type="button" aria-label={`Move ${tab.label} into a group`} onClick={onMove}>Move…</button><button type="button" aria-label={`Reorder ${tab.label}`} onClick={() => onDragEnd(Math.max(0, tab.order - 1))}>↑</button></div>;
}
