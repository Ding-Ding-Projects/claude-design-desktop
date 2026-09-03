import React, { useEffect, useMemo, useRef, useState } from "react";
import { applyBulkClose, applyRegexToSearch, bulkClosePreview, createNavigationState, moveTabToGroup, reorderTab, searchGroups, searchTabs, setDock, setTabPinned, toggleGroupCollapsed, updateSearch, createGroup, type NavigationState } from "./navigation-controller";
import { createAppearance, loadAppearance, rainbowCss, saveAppearance, setAppearanceProperty, setColor, setTypography, translateHex, undoAppearance, redoAppearance, serializeAppearance, deserializeAppearance } from "./appearance-model";
import { addRegexTest, createRegexWorkbench, runRegexTests, saveRegexSnippet, setRegexInput } from "./regex-workbench";
import { createPaletteState, filterCommands, filterCommandsBySearch, openPalette, closePalette, setPaletteQuery, setPaletteSize, teleportTarget, type PaletteState } from "./command-palette";
import { createContextMenu, filterContextActions } from "./context-menu";
import type { CommandDescriptor, ElementAppearance, SearchScope, SearchState, Tab, TabDock, TabGroup } from "./types";

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
  const [paletteSearch, setPaletteSearch] = useState<SearchState>({ query: "", pattern: "", flags: "", mode: "text", valid: true });
  const [appearance, setAppearance] = useState<ElementAppearance>(() => createAppearance("experience-shell"));
  const [regex, setRegex] = useState(() => createRegexWorkbench());
  const [activeRegexScope, setActiveRegexScope] = useState<SearchScope | "appearance" | "palette" | "menu" | "move-picker">("strip");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<string>();
  const [menuQuery, setMenuQuery] = useState("");
  const [movePickerTabId, setMovePickerTabId] = useState<string>();
  const [movePickerQuery, setMovePickerQuery] = useState("");
  const [movePickerSearch, setMovePickerSearch] = useState<SearchState>({ query: "", pattern: "", flags: "", mode: "text", valid: true });
  const [bulkMode, setBulkMode] = useState<"contains" | "not-contains">("contains");
  const [bulkQuery, setBulkQuery] = useState("");
  const [includePinned, setIncludePinned] = useState(false);
  const [status, setStatus] = useState("Ready");
  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      const stored = loadAppearance(localStorage, "claude-design-experience-appearance", "experience-shell");
      if (stored) setAppearance(stored);
    }
  }, []);
  useEffect(() => {
    if (typeof localStorage !== "undefined") saveAppearance(localStorage, "claude-design-experience-appearance", appearance);
  }, [appearance]);

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
  const currentMenu = menuTarget ? filterContextActions(createContextMenu(menuTarget, navigation.tabs.find((tab) => tab.id === menuTarget)?.label || navigation.groups.find((group) => group.id === menuTarget)?.name || menuTarget), menuQuery) : undefined;

  function handlePaletteKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") setPalette(closePalette(palette));
    if (event.key === "Enter") {
      const command = filterCommandsBySearch(commands, paletteSearch)[0];
      if (!command) return;
      navigateCommand(command);
      setPalette(closePalette(palette));
    }
  }

  function navigateCommand(command: CommandDescriptor): void {
    if (command.kind === "setting" && command.value) setNavigation((current) => setDock(current, command.value as NavigationState["dock"]));
    const target = teleportTarget(command);
    if (target.tabId) setNavigation((current) => ({ ...current, activeTabId: target.tabId }));
    onTeleport?.(target);
    setStatus(`Moved to ${command.label}`);
    if (typeof document !== "undefined") window.setTimeout(() => {
      const id = target.elementId || (target.tabId ? `tab-${target.tabId}` : target.groupId ? `group-${target.groupId}` : undefined);
      if (id) document.getElementById(id)?.focus();
    }, 0);
  }

  function openRegex(scope: typeof activeRegexScope): void {
    setActiveRegexScope(scope);
    if (scope === "appearance" || scope === "palette" || scope === "menu") {
      setRegex(setRegexInput(regex, { mode: "regex" }));
      return;
    }
    if (scope === "move-picker") {
      setRegex(createRegexWorkbench(movePickerSearch.pattern || movePickerSearch.query, navigation.groups.map((group) => group.name).join("\n")));
      setRegex((current) => setRegexInput(current, { mode: "regex", flags: movePickerSearch.flags }));
      return;
    }
    const search = navigation.searches[scope];
    setRegex(createRegexWorkbench(search.pattern || search.query, navigation.tabs.map((tab) => tab.label).join("\n")));
    setRegex((current) => setRegexInput(current, { mode: "regex", flags: search.flags }));
  }

  function handleScopeSearch(scope: SearchScope, value: string): void {
    const next = updateSearch(navigation, scope, { query: value });
    setNavigation(next);
    if (activeRegexScope === scope) setRegex((current) => setRegexInput(current, { sample: navigation.tabs.map((tab) => tab.label).join("\n") }));
  }

  function updateRegexInput(input: Parameters<typeof setRegexInput>[1]): void {
    setRegex((current) => {
      const next = setRegexInput(current, input);
      if (["strip", "group", "groups", "all"].includes(activeRegexScope)) {
        setNavigation((currentNavigation) => applyRegexToSearch(currentNavigation, activeRegexScope as SearchScope, next.pattern, next.flags, next.valid, next.error));
      }
      if (activeRegexScope === "palette") setPaletteSearch((current) => ({ ...current, pattern: next.pattern, flags: next.flags, mode: "regex", valid: next.valid, error: next.error }));
      if (activeRegexScope === "move-picker") setMovePickerSearch((current) => ({ ...current, pattern: next.pattern, flags: next.flags, mode: "regex", valid: next.valid, error: next.error }));
      return next;
    });
  }

  function handleShellKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.ctrlKey && event.shiftKey && event.key.toLocaleLowerCase() === "f") {
      event.preventDefault();
      setPalette((current) => openPalette(current));
    }
  }

  function handleContextAction(actionId: string, targetId: string): void {
    if (actionId === "edit-appearance") setStatus(`Editing appearance for ${targetId}`);
    if (actionId === "lock-element") setStatus(`Lock configured for ${targetId}`);
    if (actionId === "copy-style") setStatus(`Style copied from ${targetId}`);
    if (actionId === "reset-appearance") setAppearance(createAppearance(targetId));
    setMenuTarget(undefined);
    setMenuQuery("");
  }

  function navigateTab(tabId: string, direction: "previous" | "next"): void {
    const ordered = navigation.tabs.slice().sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((tab) => tab.id === tabId);
    if (index < 0) return;
    const next = ordered[Math.max(0, Math.min(ordered.length - 1, index + (direction === "next" ? 1 : -1)))];
    if (next) setNavigation((current) => ({ ...current, activeTabId: next.id }));
  }

  const appearanceStyle: React.CSSProperties = {
    borderRadius: `${Number(appearance.properties.radius || 12)}px`,
    fontWeight: appearance.typography.weight,
    fontFamily: appearance.typography.family,
    fontSize: `${appearance.typography.sizePx}px`,
    color: appearance.typography.textColor,
    background: "sentinel" in appearance.color ? rainbowCss(appearance.color.speedLevel) : appearance.color.rgba
  };
  const pickerGroups = navigation.groups.filter((group) => {
    const haystack = group.name;
    if (!movePickerSearch.query && !movePickerSearch.pattern) return true;
    if (movePickerSearch.mode === "text") return haystack.toLocaleLowerCase().includes(movePickerSearch.query.toLocaleLowerCase());
    if (!movePickerSearch.valid) return false;
    try { return new RegExp(movePickerSearch.pattern || movePickerSearch.query, movePickerSearch.flags).test(haystack); } catch { return false; }
  });

  return <main className={`experience-shell dock-${navigation.dock}`} style={appearanceStyle} onKeyDown={handleShellKeyDown} onContextMenu={(event) => { event.preventDefault(); setMenuTarget("experience-shell"); }}>
    <header className="experience-toolbar">
      <button type="button" aria-label="Open command palette" onClick={() => setPalette(openPalette(palette))}>Command palette <kbd>Ctrl+Shift+F</kbd></button>
      <label>Dock tabs<select aria-label="Tab strip position" value={navigation.dock} onChange={(event) => setNavigation(setDock(navigation, event.target.value as NavigationState["dock"]))}><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
      <button type="button" onClick={() => setAppearance(setAppearanceProperty(appearance, "outline", "1px solid #6750A4"))}>Edit appearance…</button>
      <span role="status" aria-live="polite">{status}</span>
    </header>

    <nav className="tab-strip" aria-label="Browser tabs" role="tablist" aria-orientation={navigation.dock === "left" || navigation.dock === "right" ? "vertical" : "horizontal"}>
      {navigation.groups.map((group) => <section key={group.id} className="tab-group" aria-label={group.name}>
        <button id={`group-${group.id}`} type="button" className="group-header" aria-expanded={!group.collapsed} onContextMenu={(event) => { event.preventDefault(); setMenuTarget(group.id); }} onClick={() => setNavigation(toggleGroupCollapsed(navigation, group.id))}>{group.name} <span>{group.collapsed ? "Collapsed" : "Expanded"}</span></button>
        {!group.collapsed && navigation.tabs.filter((tab) => tab.groupId === group.id).map((tab) => <TabButton key={tab.id} tab={tab} active={navigation.activeTabId === tab.id} dock={navigation.dock} onSelect={() => setNavigation({ ...navigation, activeTabId: tab.id })} onPin={() => setNavigation(setTabPinned(navigation, tab.id, !tab.pinned))} onMove={() => { setMovePickerTabId(tab.id); setMovePickerQuery(""); }} onDragEnd={(destination) => setNavigation(reorderTab(navigation, tab.id, destination))} onContextMenu={() => setMenuTarget(tab.id)} onNavigate={navigateTab} />)}
      </section>)}
      {navigation.tabs.filter((tab) => !tab.groupId).map((tab) => <TabButton key={tab.id} tab={tab} active={navigation.activeTabId === tab.id} dock={navigation.dock} onSelect={() => setNavigation({ ...navigation, activeTabId: tab.id })} onPin={() => setNavigation(setTabPinned(navigation, tab.id, !tab.pinned))} onMove={() => { setMovePickerTabId(tab.id); setMovePickerQuery(""); }} onDragEnd={(destination) => setNavigation(reorderTab(navigation, tab.id, destination))} onContextMenu={() => setMenuTarget(tab.id)} onNavigate={navigateTab} />)}
      <button type="button" aria-label="Show overflow tabs" onClick={() => setStatus(`${navigation.tabs.length} tabs, ${navigation.tabs.filter((tab) => !navigation.expandedGroupIds.includes(tab.groupId || "") && tab.groupId).length} collapsed`)}>More tabs…</button>
    </nav>

    {navigation.activeTabId && <section id={`tabpanel-${navigation.activeTabId}`} role="tabpanel" aria-labelledby={`tab-${navigation.activeTabId}`} tabIndex={0} className="tab-panel"><h2>{navigation.tabs.find((tab) => tab.id === navigation.activeTabId)?.label || "Selected tab"}</h2><p>Content for the selected tab is rendered here. Use the tab strip to switch destinations.</p></section>}

    <section className="tab-searches" aria-label="Tab discovery searches">
      {scopes.map(({ id, label }) => <div className="search-row" key={id}><label htmlFor={`search-${id}`}>{label}</label><input id={`search-${id}`} value={navigation.searches[id].query} onChange={(event) => handleScopeSearch(id, event.target.value)} /><button type="button" aria-label={`Open regex builder for ${label}`} onClick={() => openRegex(id)}>Regex…</button><output>{id === "group" ? searchTabs(navigation, id, navigation.groups[0]?.id).length : id === "groups" ? searchGroups(navigation).length : searchTabs(navigation, id).length} matches</output></div>)}
      <button type="button" onClick={() => setNavigation(createGroup(navigation, "New group"))}>Create group</button>
    </section>

    <section className="bulk-close" aria-label="Bulk close tabs"><h2>Bulk close preview</h2><select aria-label="Bulk close mode" value={bulkMode} onChange={(event) => setBulkMode(event.target.value as typeof bulkMode)}><option value="contains">Close tabs containing text</option><option value="not-contains">Close tabs not containing text</option></select><input aria-label="Bulk close text" value={bulkQuery} onChange={(event) => setBulkQuery(event.target.value)} /><button type="button" onClick={() => openRegex("strip")}>Regex…</button><label><input type="checkbox" checked={includePinned} onChange={(event) => setIncludePinned(event.target.checked)} /> Include pinned tabs</label><p>{preview.matches.length} tabs will close, {preview.excluded.length} excluded.</p><button type="button" disabled={!preview.canApply} onClick={() => setBulkConfirmOpen(true)}>Review and close</button></section>

    {bulkConfirmOpen && <MovablePanel className="bulk-confirm" role="dialog" aria-label="Confirm bulk close"><h2>Review tabs to close</h2><p>{preview.matches.length} tabs will close. Pinned, locked, and unsaved tabs remain excluded.</p><ul>{preview.matches.map((tab) => <li key={tab.id}>{tab.label}</li>)}</ul><button type="button" onClick={() => { setNavigation(applyBulkClose(navigation, preview, true)); setBulkConfirmOpen(false); setStatus(`Closed ${preview.matches.length} tabs`); }}>Confirm close</button><button type="button" onClick={() => setBulkConfirmOpen(false)}>Cancel</button></MovablePanel>}

    <section className="appearance-editor" aria-label="Appearance editor"><h2>Appearance editor</h2><p>Editing: {appearance.elementId}. Changes are reversible and scoped to this element.</p><button type="button" onClick={() => setAppearance(undoAppearance(appearance))}>Undo</button><button type="button" onClick={() => setAppearance(redoAppearance(appearance))}>Redo</button><button type="button" onClick={() => setAppearance(setTypography(appearance, { weight: appearance.typography.weight === 400 ? 700 : 400 }))}>Toggle weight</button><button type="button" onClick={() => setAppearance(setColor(appearance, translateHex("#6750A4")))}>Use translated color</button><button type="button" onClick={() => setAppearance(setColor(appearance, { sentinel: "rainbow", speedLevel: 3 }))}>Rainbow</button><code>{appearance.color && "sentinel" in appearance.color ? rainbowCss(appearance.color.speedLevel) : serializeAppearance(appearance).slice(0, 80)}</code><button type="button" onClick={() => { const restored = deserializeAppearance(serializeAppearance(appearance), appearance.elementId); setAppearance(restored); setStatus("Appearance export round-tripped"); }}>Export/import round trip</button></section>

    {movePickerTabId && <MovablePanel className="move-picker" aria-label="Move tab into group"><h2>Move tab into group</h2><p>{navigation.tabs.find((tab) => tab.id === movePickerTabId)?.label || "Tab"}</p><label>Search groups<input autoFocus value={movePickerQuery} onChange={(event) => { setMovePickerQuery(event.target.value); setMovePickerSearch((current) => ({ ...current, query: event.target.value })); }} /></label><button type="button" onClick={() => openRegex("move-picker")}>Regex…</button><ul>{pickerGroups.map((group) => <li key={group.id}><button type="button" onContextMenu={(event) => { event.preventDefault(); setMenuTarget(group.id); }} onClick={() => { setNavigation(moveTabToGroup(navigation, movePickerTabId, group.id)); setMovePickerTabId(undefined); }}>{group.name} · {navigation.tabs.filter((tab) => tab.groupId === group.id).length} tabs</button></li>)}</ul><button type="button" onClick={() => { const next = createGroup(navigation, "New group"); setNavigation(moveTabToGroup(next, movePickerTabId, next.groups.at(-1)?.id)); setMovePickerTabId(undefined); }}>Create new group</button><button type="button" onClick={() => setMovePickerTabId(undefined)}>Cancel</button></MovablePanel>}

    {activeRegexScope && <MovablePanel className="regex-workbench" aria-label="Advanced regex workbench"><h2>Advanced regex workbench</h2><p>{regex.engine} · {regex.dialect} · {regex.engineVersion}</p><label>Pattern<input value={regex.pattern} onChange={(event) => updateRegexInput({ pattern: event.target.value })} /></label><label>Flags<input value={regex.flags} onChange={(event) => updateRegexInput({ flags: event.target.value })} /></label><label>Sample<textarea value={regex.sample} onChange={(event) => updateRegexInput({ sample: event.target.value })} /></label><label>Replacement<input value={regex.replacement} onChange={(event) => updateRegexInput({ replacement: event.target.value })} /></label><p role="status">{regex.valid ? regex.explanation : regex.error}</p><p>Risk: {regex.performance.risk}; {regex.performance.matchCount} matches in {regex.performance.elapsedMs}ms.</p><ul>{regex.capabilities.map((capability) => <li key={capability.name}>{capability.name}: {capability.supported ? "supported" : capability.explanation}</li>)}</ul><button type="button" onClick={() => setRegex(runRegexTests(addRegexTest(regex, regex.sample, regex.matches.length > 0)))}>Run test</button><button type="button" onClick={() => setRegex(saveRegexSnippet(regex, "Current pattern"))}>Save snippet</button><details><summary>Structured trace and captures</summary><pre>{JSON.stringify({ tokens: regex.tokens, matches: regex.matches, trace: regex.trace, replacement: regex.replacementPreview }, null, 2)}</pre></details></MovablePanel>}

    {currentMenu && <MovablePanel className="context-menu" aria-label={`Actions for ${currentMenu.accessibleName}`}><input autoFocus aria-label="Filter context actions" value={menuQuery} onChange={(event) => setMenuQuery(event.target.value)} /><p>Keyboard: {currentMenu.keyboardEquivalent}. Touch: {currentMenu.touchEquivalent}.</p>{currentMenu.actions.map((action) => <button type="button" key={action.id} onClick={() => handleContextAction(action.id, currentMenu.targetId)}>{action.label}{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>)}</MovablePanel>}

    {palette.open && <MovablePanel className={`command-palette ${palette.size}`} aria-label="Command palette"><input autoFocus aria-label="Search commands" value={palette.query} onChange={(event) => { setPalette(setPaletteQuery(palette, event.target.value, commands)); setPaletteSearch((current) => ({ ...current, query: event.target.value })); }} onKeyDown={handlePaletteKeyDown} /><button type="button" aria-label="Open regex builder for command search" onClick={() => openRegex("palette")}>Regex…</button><button type="button" onClick={() => setPalette(setPaletteSize(palette, palette.size === "card" ? "window" : "card"))}>Resize palette</button><button type="button" onClick={() => setPalette(closePalette(palette))}>Close</button><ul>{filterCommandsBySearch(commands, paletteSearch).map((command) => <li className={palette.highlightedId === command.id ? "highlighted" : undefined} aria-current={palette.highlightedId === command.id ? "true" : undefined} key={command.id}><button type="button" onClick={() => { navigateCommand(command); setPalette(closePalette(palette)); }}>{command.label}</button>{command.value !== undefined && <select aria-label={`Change ${command.label}`} value={String(command.value)} onChange={(event) => setNavigation(setDock(navigation, event.target.value as NavigationState["dock"]))}><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select>}</li>)}</ul></MovablePanel>}
  </main>;
}

function TabButton({ tab, active, dock, onSelect, onPin, onMove, onDragEnd, onContextMenu, onNavigate }: { tab: Tab; active: boolean; dock: TabDock; onSelect: () => void; onPin: () => void; onMove: () => void; onDragEnd: (index: number) => void; onContextMenu: () => void; onNavigate: (tabId: string, direction: "previous" | "next") => void }): React.ReactElement {
  const previousKey = dock === "left" || dock === "right" ? "ArrowUp" : "ArrowLeft";
  const nextKey = dock === "left" || dock === "right" ? "ArrowDown" : "ArrowRight";
  return <div className={`tab-item ${tab.pinned ? "pinned" : ""}`} onContextMenu={(event) => { event.preventDefault(); onContextMenu(); }}><button id={`tab-${tab.id}`} type="button" role="tab" tabIndex={active ? 0 : -1} aria-selected={active} aria-controls={`tabpanel-${tab.id}`} aria-label={`${tab.label}${tab.pinned ? ", pinned" : ""}${tab.locked ? ", locked" : ""}`} onKeyDown={(event) => { if (event.key === "F10" && event.shiftKey) { event.preventDefault(); onContextMenu(); } if (event.key === previousKey) { event.preventDefault(); onNavigate(tab.id, "previous"); } if (event.key === nextKey) { event.preventDefault(); onNavigate(tab.id, "next"); } }} onClick={onSelect}>{tab.label}</button><button type="button" aria-label={`${tab.pinned ? "Unpin" : "Pin"} ${tab.label}`} onClick={onPin}>📌</button><button type="button" aria-label={`Move ${tab.label} into a group`} onClick={onMove}>Move…</button><button type="button" aria-label={`Reorder ${tab.label}`} onClick={() => onDragEnd(Math.max(0, tab.order - 1))}>↑</button></div>;
}

function MovablePanel({ className, role, children, "aria-label": ariaLabel }: { className: string; role?: string; children: React.ReactNode; "aria-label": string }): React.ReactElement {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number }>();
  useEffect(() => {
    const move = (event: PointerEvent) => { if (drag.current) setOffset({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y }); };
    const up = () => { drag.current = undefined; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);
  return <aside className={className} role={role} aria-label={ariaLabel} tabIndex={-1} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} onKeyDown={(event) => { const amount = event.shiftKey ? 24 : 8; if (event.key === "ArrowLeft") setOffset((current) => ({ ...current, x: current.x - amount })); if (event.key === "ArrowRight") setOffset((current) => ({ ...current, x: current.x + amount })); if (event.key === "ArrowUp") setOffset((current) => ({ ...current, y: current.y - amount })); if (event.key === "ArrowDown") setOffset((current) => ({ ...current, y: current.y + amount })); }}><header className="panel-drag-handle" tabIndex={0} onPointerDown={(event) => { drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y }; }} aria-label="Drag panel">Move panel · use arrow keys</header>{children}</aside>;
}
