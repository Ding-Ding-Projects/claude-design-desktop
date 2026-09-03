import type { ContextMenuDescriptor, SearchState } from "./types";

export function createContextMenu(targetId: string, accessibleName: string, shortcut?: string): ContextMenuDescriptor {
  const search: SearchState = { query: "", pattern: "", flags: "", mode: "text", valid: true };
  return {
    targetId,
    accessibleName,
    keyboardEquivalent: "Shift+F10 or the Context Menu key",
    touchEquivalent: "Long press",
    search,
    actions: [
      { id: "edit-appearance", label: "Edit appearance…", shortcut },
      { id: "lock-element", label: "Lock this element…" },
      { id: "copy-style", label: "Copy style" },
      { id: "reset-appearance", label: "Reset appearance" }
    ]
  };
}

export function filterContextActions(menu: ContextMenuDescriptor, query: string): ContextMenuDescriptor {
  const normalized = query.trim().toLocaleLowerCase();
  return { ...menu, search: { ...menu.search, query }, actions: normalized ? menu.actions.filter((action) => action.label.toLocaleLowerCase().includes(normalized)) : menu.actions };
}

