import type { CommandDescriptor, SearchState } from "./types";

export type PaletteState = {
  open: boolean;
  query: string;
  size: "card" | "window";
  highlightedId?: string;
};

export function createPaletteState(): PaletteState {
  return { open: false, query: "", size: "card" };
}

export function filterCommands(commands: CommandDescriptor[], query: string): CommandDescriptor[] {
  const value = query.trim().toLocaleLowerCase();
  if (!value) return commands;
  return commands.filter((command) => `${command.label} ${command.kind} ${command.tabId || ""} ${command.groupId || ""}`.toLocaleLowerCase().includes(value));
}

export function filterCommandsBySearch(commands: CommandDescriptor[], search: SearchState): CommandDescriptor[] {
  if (!search.query && !search.pattern) return commands;
  if (search.mode === "text") return filterCommands(commands, search.query);
  if (!search.valid) return [];
  try {
    const expression = new RegExp(search.pattern || search.query, search.flags);
    return commands.filter((command) => expression.test(`${command.label} ${command.kind} ${command.tabId || ""} ${command.groupId || ""}`));
  } catch { return []; }
}

export function openPalette(state: PaletteState): PaletteState { return { ...state, open: true, query: "", highlightedId: undefined }; }
export function closePalette(state: PaletteState): PaletteState { return { ...state, open: false, query: "" }; }
export function setPaletteSize(state: PaletteState, size: PaletteState["size"]): PaletteState { return { ...state, size }; }
export function setPaletteQuery(state: PaletteState, query: string, commands: CommandDescriptor[]): PaletteState {
  return { ...state, query, highlightedId: filterCommands(commands, query)[0]?.id };
}

export function teleportTarget(command: CommandDescriptor): { tabId?: string; groupId?: string; elementId?: string } {
  return { tabId: command.tabId, groupId: command.groupId, elementId: command.elementId };
}
