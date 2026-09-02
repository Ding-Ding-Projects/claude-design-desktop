import type { Notification } from "./types.js";

export class NotificationCenter {
  private readonly records: Notification[] = [];
  private nextId = 1;
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}
  publish(notification: Omit<Notification, "id" | "createdAt">): Notification { const record = { ...notification, id: `notification-${this.nextId++}`, createdAt: this.now() }; this.records.push(record); return { ...record }; }
  dismiss(id: string): boolean { const found = this.records.find(item => item.id === id); if (!found) return false; found.dismissedAt = this.now(); return true; }
  list(includeDismissed = true): Notification[] { return this.records.filter(item => includeDismissed || !item.dismissedAt).map(item => ({ ...item })); }
  bulkDismiss(ids: readonly string[]): number { return ids.reduce((count, id) => count + (this.dismiss(id) ? 1 : 0), 0); }
}

export interface HistoryRecord { id: string; action: string; targetId: string; summary: string; createdAt: string; redacted: true; }
/** An in-memory projection only. Persistent history belongs to the owning app adapter. */
export class HistoryProjection {
  private readonly records: HistoryRecord[] = [];
  private nextId = 1;
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}
  record(action: string, targetId: string, summary: string): HistoryRecord { const value = { id: `history-${this.nextId++}`, action, targetId, summary, createdAt: this.now(), redacted: true as const }; this.records.push(value); return { ...value }; }
  list(filter: { action?: string; from?: string; to?: string; query?: string } = {}): HistoryRecord[] { return this.records.filter(item => (!filter.action || item.action === filter.action) && (!filter.from || item.createdAt >= filter.from) && (!filter.to || item.createdAt <= filter.to) && (!filter.query || `${item.action} ${item.summary}`.toLocaleLowerCase().includes(filter.query.toLocaleLowerCase()))).map(item => ({ ...item })); }
  actions(): Map<string, number> { const counts = new Map<string, number>(); for (const record of this.records) counts.set(record.action, (counts.get(record.action) ?? 0) + 1); return counts; }
}
