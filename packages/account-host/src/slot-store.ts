import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveSlotHome, validateLabel, validateSlotId } from "./config.js";
import type { AccountSlotState, AccountSlotSummary } from "./types.js";

export interface StoredAccountSlot extends AccountSlotSummary { home: string; }
interface StoreFile { version: 1; slots: StoredAccountSlot[]; }

/** Persists only non-secret account metadata. App-server owns the credential vault. */
export class AccountSlotStore {
  private readonly filePath: string;
  private readonly accountsRoot: string;
  private slots = new Map<string, StoredAccountSlot>();
  constructor(accountsRoot: string) { this.accountsRoot = accountsRoot; this.filePath = join(accountsRoot, "accounts.json"); }
  async load(): Promise<void> {
    this.slots.clear();
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as StoreFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.slots)) throw new Error("Unsupported account store version");
      for (const candidate of parsed.slots) {
        if (!candidate || typeof candidate !== "object") continue;
        try {
          const slotId = validateSlotId(candidate.slotId);
          const label = validateLabel(candidate.label);
          this.slots.set(slotId, {
            slotId, label,
            email: typeof candidate.email === "string" ? candidate.email.slice(0, 320) : null,
            planType: typeof candidate.planType === "string" ? candidate.planType.slice(0, 80) : null,
            state: normalizeState(candidate.state), appServerVersion: typeof candidate.appServerVersion === "string" ? candidate.appServerVersion.slice(0, 32) : "0.152.1",
            lastVerifiedAt: typeof candidate.lastVerifiedAt === "string" ? candidate.lastVerifiedAt : null,
            home: resolveSlotHome(this.accountsRoot, slotId),
          });
        } catch { /* Ignore malformed stale metadata rather than exposing it. */ }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  list(): StoredAccountSlot[] { return [...this.slots.values()].map((slot) => ({ ...slot })); }
  get(slotId: string): StoredAccountSlot { const value = this.slots.get(validateSlotId(slotId)); if (!value) throw new Error("Unknown account slot"); return { ...value }; }
  create(label: string): StoredAccountSlot {
    const slotId = randomUUID();
    const value: StoredAccountSlot = { slotId, label: validateLabel(label), email: null, planType: null, state: "signedOut", lastVerifiedAt: null, appServerVersion: "0.152.1", home: resolveSlotHome(this.accountsRoot, slotId) };
    this.slots.set(slotId, value); return { ...value };
  }
  update(slotId: string, patch: Partial<Omit<StoredAccountSlot, "slotId" | "home">>): StoredAccountSlot {
    const current = this.get(slotId);
    const updated: StoredAccountSlot = { ...current, ...patch, slotId: current.slotId, home: current.home, label: validateLabel(patch.label ?? current.label), email: patch.email === undefined ? current.email : normalizeNullable(patch.email, 320), planType: patch.planType === undefined ? current.planType : normalizeNullable(patch.planType, 80), state: patch.state === undefined ? current.state : normalizeState(patch.state) };
    this.slots.set(slotId, updated); return { ...updated };
  }
  async remove(slotId: string): Promise<void> { this.slots.delete(validateSlotId(slotId)); await this.save(); }
  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, slots: this.list() } satisfies StoreFile, null, 2), { encoding: "utf8", mode: 0o600 });
    await renameWithRetry(temporary, this.filePath);
  }
}
function normalizeNullable(value: string | null, max: number): string | null { return value === null ? null : value.slice(0, max); }
function normalizeState(value: unknown): AccountSlotState { return value === "signedOut" || value === "signingIn" || value === "ready" || value === "refreshing" || value === "offline" || value === "unavailable" || value === "error" ? value : "signedOut"; }
async function renameWithRetry(source: string, destination: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await rename(source, destination); return; }
    catch (error) { lastError = error; const code = (error as NodeJS.ErrnoException).code; if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error; await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1))); }
  }
  throw lastError;
}
