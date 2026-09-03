import type { HistoryEntry } from "./types";
import { digestText, randomId, SecretVault, verifySecret, storeHashedSecret } from "./vault";

export interface AppendOnlyHistoryStore {
  append(entry: HistoryEntry): Promise<void>;
  list(): Promise<HistoryEntry[]>;
}

export class MemoryHistoryStore implements AppendOnlyHistoryStore {
  private readonly entries: HistoryEntry[] = [];

  async append(entry: HistoryEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async list(): Promise<HistoryEntry[]> {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

export class PasswordProtectedHistoryManager {
  private readonly store: AppendOnlyHistoryStore;
  private readonly vault: SecretVault;
  private readonly passwordRef: string;
  private opened = false;

  constructor(store: AppendOnlyHistoryStore, vault: SecretVault, passwordRef = randomId("history-password")) {
    this.store = store;
    this.vault = vault;
    this.passwordRef = passwordRef;
  }

  async setPassword(password: string): Promise<void> {
    if (password.length < 8) throw new Error("History password must contain at least 8 characters");
    await storeHashedSecret(this.vault, this.passwordRef, password);
  }

  async open(password: string): Promise<boolean> {
    this.opened = await verifySecret(this.vault, this.passwordRef, password);
    return this.opened;
  }

  close(): void {
    this.opened = false;
  }

  isOpen(): boolean {
    return this.opened;
  }

  async append(action: HistoryEntry["action"], label: string, snapshotRef?: string, occurredAt = Date.now()): Promise<HistoryEntry> {
    this.requireOpen();
    if (!label.trim() || label.length > 240) throw new Error("History label is required and bounded");
    const entry: HistoryEntry = {
      id: randomId("history"),
      action,
      label: label.trim(),
      occurredAt,
      snapshotRef,
      redacted: true
    };
    await this.store.append(entry);
    return { ...entry };
  }

  async list(filter: { action?: HistoryEntry["action"]; from?: number; to?: number; query?: string } = {}): Promise<HistoryEntry[]> {
    this.requireOpen();
    const query = filter.query?.trim().toLocaleLowerCase();
    return (await this.store.list()).filter((entry) => {
      if (filter.action && entry.action !== filter.action) return false;
      if (filter.from !== undefined && entry.occurredAt < filter.from) return false;
      if (filter.to !== undefined && entry.occurredAt > filter.to) return false;
      return !query || entry.label.toLocaleLowerCase().includes(query);
    });
  }

  async exportRedacted(): Promise<string> {
    const entries = (await this.list()).map(({ snapshotRef: _snapshotRef, ...entry }) => entry);
    return JSON.stringify({ version: 1, secretsOmitted: true, entries }, null, 2);
  }

  private requireOpen(): void {
    if (!this.opened) throw new Error("History manager is locked");
  }
}

export async function historyPasswordDigest(password: string): Promise<string> {
  return digestText(password);
}
