export interface Command { id: string; label: string; description?: string; shortcut?: string; run(): void; control?: { kind: string; value?: unknown; set(value: unknown): void }; }
export class CommandPalette {
  private readonly commands = new Map<string, Command>();
  register(command: Command): void { if (this.commands.has(command.id)) throw new Error(`Duplicate command id: ${command.id}`); this.commands.set(command.id, command); }
  unregister(id: string): void { this.commands.delete(id); }
  search(query: string): Command[] { const needle = query.toLocaleLowerCase(); return [...this.commands.values()].filter(command => `${command.label} ${command.description ?? ""}`.toLocaleLowerCase().includes(needle)); }
  activate(id: string): void { const command = this.commands.get(id); if (!command) throw new Error(`Unknown command: ${id}`); command.run(); }
  list(): Command[] { return [...this.commands.values()]; }
}
