import type { LockDefinition } from "./types.js";

export const LOCK_POLICIES = ["pin", "password", "pin+password", "password+totp", "pin+totp", "password+pin+totp"] as const;
export class LockRegistry {
  private readonly locks = new Map<string, LockDefinition>();
  add(lock: LockDefinition): void { if (!LOCK_POLICIES.includes(lock.policy)) throw new Error("Unsupported lock policy"); if (this.locks.has(lock.id)) throw new Error("Duplicate lock id"); this.locks.set(lock.id, { ...lock }); }
  remove(id: string): boolean { return this.locks.delete(id); }
  getForTarget(targetId: string): LockDefinition | undefined { const lock = [...this.locks.values()].find(item => item.targetId === targetId); return lock ? { ...lock } : undefined; }
  list(): LockDefinition[] { return [...this.locks.values()].map(lock => ({ ...lock })); }
}

export type LadderRung = "dish" | "sums" | "moles" | "clock";
export interface UnlockLadderView { rung: LadderRung; wrongDishes: number; attempts: number; budgetRemaining: number; noncePresent: boolean; complete: false; }
/** The host owns nonce creation and grading. This helper only selects the first display rung. */
export function ladderStartView(schoolMode: boolean): UnlockLadderView { return { rung: schoolMode ? "sums" : "dish", wrongDishes: 0, attempts: 0, budgetRemaining: 0, noncePresent: false, complete: false }; }

export interface OtpPairingMetadata { issuer: string; account: string; algorithm: "SHA-1" | "SHA-256" | "SHA-512"; digits: 6 | 7 | 8; period: number; confirmed: boolean; }
/** Pairing metadata deliberately excludes the secret and URI. The host renders those privately. */
export function pairingMetadata(input: Omit<OtpPairingMetadata, "confirmed">): OtpPairingMetadata { return { ...input, confirmed: false }; }
