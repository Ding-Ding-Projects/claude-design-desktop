import {
  LOCK_POLICY_FACTORS,
  type FactorState,
  type InternalLockRecord,
  type LockFactor,
  type LockPolicy,
  type LockSummary,
  type UnlockDuration,
  type UnlockSession
} from "./types";
import { randomId, SecretVault, storeHashedSecret, verifySecret } from "./vault";
import { normalizeBase32, verifyTotpCodeAt } from "./totp";

export const LOCK_DISCLOSURE = "This lock is for fun only. It is not security, encryption, or protection from another person using this computer.";

export type LockManagerOptions = {
  vault: SecretVault;
  now?: () => number;
  maxAttempts?: number;
  state?: LockStatePersistence;
  cooldownMs?: number;
};

export interface LockStatePersistence {
  loadAttempts(lockId: string, factors: readonly LockFactor[]): Map<LockFactor, number>;
  saveAttempt(lockId: string, factor: LockFactor, attempts: number): void;
  loadCooldown(lockId: string, factor: LockFactor): number;
  saveCooldown(lockId: string, factor: LockFactor, until: number): void;
}

export class MemoryLockStatePersistence implements LockStatePersistence {
  private readonly attempts = new Map<string, Map<LockFactor, number>>();
  private readonly cooldowns = new Map<string, Map<LockFactor, number>>();
  loadAttempts(lockId: string, factors: readonly LockFactor[]): Map<LockFactor, number> {
    const existing = this.attempts.get(lockId) ?? new Map(factors.map((factor) => [factor, 0]));
    this.attempts.set(lockId, existing);
    return new Map(existing);
  }
  saveAttempt(lockId: string, factor: LockFactor, attempts: number): void {
    const record = this.attempts.get(lockId) ?? new Map<LockFactor, number>();
    record.set(factor, attempts);
    this.attempts.set(lockId, record);
  }
  loadCooldown(lockId: string, factor: LockFactor): number { return this.cooldowns.get(lockId)?.get(factor) ?? 0; }
  saveCooldown(lockId: string, factor: LockFactor, until: number): void {
    const record = this.cooldowns.get(lockId) ?? new Map<LockFactor, number>();
    record.set(factor, until);
    this.cooldowns.set(lockId, record);
  }
}

export type ActivationResult =
  | { kind: "activated" }
  | { kind: "authentication-required"; lockId: string; elementId: string };

export class LockManager {
  private readonly locks = new Map<string, InternalLockRecord>();
  private readonly sessions = new Map<string, UnlockSession>();
  private readonly usedSessionIds = new Set<string>();
  private readonly attemptBudgets = new Map<string, Map<LockFactor, number>>();
  private readonly vault: SecretVault;
  private readonly now: () => number;
  private readonly maxAttempts: number;
  private readonly state: LockStatePersistence;
  private readonly cooldownMs: number;

  constructor(options: LockManagerOptions) {
    this.vault = options.vault;
    this.now = options.now ?? (() => Date.now());
    this.maxAttempts = options.maxAttempts ?? 5;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 100) throw new Error("Attempt budget is out of bounds");
    this.state = options.state ?? new MemoryLockStatePersistence();
    this.cooldownMs = options.cooldownMs ?? 15 * 60_000;
    if (!Number.isInteger(this.cooldownMs) || this.cooldownMs < 1_000 || this.cooldownMs > 24 * 60 * 60_000) throw new Error("Lock cooldown is out of bounds");
  }

  async createLock(input: {
    elementId: string;
    policy: LockPolicy;
    pin?: string;
    password?: string;
    totpSecret?: string;
    unlockDuration?: UnlockDuration;
    lockedOnLaunch?: boolean;
    recoveryDirectory: string;
    totpMetadata?: { algorithm: "SHA-1" | "SHA-256" | "SHA-512"; digits: 6 | 7 | 8; period: number };
  }): Promise<LockSummary> {
    const factors = LOCK_POLICY_FACTORS[input.policy];
    if (!factors) throw new Error("Unknown lock policy");
    for (const factor of factors) {
      if (factor === "pin" && !input.pin) throw new Error("PIN is required by this policy");
      if (factor === "password" && !input.password) throw new Error("Password is required by this policy");
      if (factor === "totp" && !input.totpSecret) throw new Error("TOTP secret is required by this policy");
    }
    validateDuration(input.unlockDuration ?? { kind: "session" });
    if (!input.recoveryDirectory.trim()) throw new Error("A recovery directory is required");
    const totpMetadata = input.totpMetadata ?? { algorithm: "SHA-1" as const, digits: 6 as const, period: 30 };
    if (!Number.isInteger(totpMetadata.period) || totpMetadata.period < 1 || totpMetadata.period > 86_400) throw new Error("TOTP metadata period is out of bounds");
    if (!( ["SHA-1", "SHA-256", "SHA-512"] as readonly string[]).includes(totpMetadata.algorithm) || ![6, 7, 8].includes(totpMetadata.digits)) throw new Error("TOTP metadata is invalid");

    const id = randomId("lock");
    const credentialRefs: InternalLockRecord["credentialRefs"] = {};
    try {
      if (factors.includes("pin") && input.pin !== undefined) {
        const ref = randomId("pin");
        await storeHashedSecret(this.vault, ref, input.pin);
        credentialRefs.pin = ref;
      }
      if (factors.includes("password") && input.password !== undefined) {
        const ref = randomId("password");
        await storeHashedSecret(this.vault, ref, input.password);
        credentialRefs.password = ref;
      }
      if (factors.includes("totp") && input.totpSecret !== undefined) {
        const ref = randomId("totp");
        await this.vault.put(ref, normalizeBase32(input.totpSecret));
        credentialRefs.totp = ref;
      }
    } catch (error) {
      for (const ref of Object.values(credentialRefs)) if (ref) await this.vault.delete(ref);
      throw error;
    }
    const record: InternalLockRecord = {
      id,
      elementId: input.elementId,
      policy: input.policy,
      createdAt: this.now(),
      unlockDuration: input.unlockDuration ?? { kind: "session" },
      lockedOnLaunch: input.lockedOnLaunch ?? true,
      credentialRefs,
      totp: factors.includes("totp") ? { ...totpMetadata } : undefined,
      disclosure: LOCK_DISCLOSURE,
      recoveryDirectory: input.recoveryDirectory
    };
    this.locks.set(id, record);
    this.attemptBudgets.set(id, this.state.loadAttempts(id, factors));
    return summarizeLock(record);
  }

  listLocks(): LockSummary[] {
    return Array.from(this.locks.values(), summarizeLock);
  }

  getLock(lockId: string): LockSummary | undefined {
    const record = this.locks.get(lockId);
    return record ? summarizeLock(record) : undefined;
  }

  beginUnlock(lockId: string, sessionId: string): UnlockSession {
    const lock = this.requireLock(lockId);
    validateSessionId(sessionId);
    if (this.usedSessionIds.has(sessionId)) throw new Error("Session ID is already in use");
    const session: UnlockSession = {
      lockId,
      sessionId,
      factors: LOCK_POLICY_FACTORS[lock.policy].map((factor): FactorState => ({ factor, verified: false, attempts: this.state.loadAttempts(lockId, LOCK_POLICY_FACTORS[lock.policy]).get(factor) ?? 0 })),
      startedAt: this.now(),
      unlockedUntil: null,
      complete: false
    };
    this.sessions.set(sessionId, session);
    this.usedSessionIds.add(sessionId);
    return cloneSession(session);
  }

  async verifyNextFactor(lockId: string, sessionId: string, candidate: string): Promise<UnlockSession> {
    const lock = this.requireLock(lockId);
    validateSessionId(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || session.lockId !== lockId) throw new Error("A valid unlock session is required");
    const current = session.factors.find((factor) => !factor.verified);
    if (!current) return cloneSession(session);
    const now = this.now();
    const cooldownUntil = this.state.loadCooldown(lockId, current.factor);
    if (cooldownUntil > now) throw new Error("Attempt budget exhausted; wait for the cooldown or use the documented recovery route");
    if (current.attempts >= this.maxAttempts) {
      current.attempts = 0;
      this.attemptBudgets.get(lockId)?.set(current.factor, 0);
      this.state.saveAttempt(lockId, current.factor, 0);
    }
    const ref = lock.credentialRefs[current.factor];
    let valid = false;
    if (ref) {
      if (current.factor === "totp") {
        const secret = await this.vault.get(ref);
        valid = secret ? await verifyTotpCodeAt(secret, candidate, now, { ...lock.totp }) : false;
      } else {
        valid = await verifySecret(this.vault, ref, candidate);
      }
    }
    if (!valid) {
      current.attempts += 1;
      this.attemptBudgets.get(lockId)?.set(current.factor, current.attempts);
      this.state.saveAttempt(lockId, current.factor, current.attempts);
      if (current.attempts >= this.maxAttempts) this.state.saveCooldown(lockId, current.factor, now + this.cooldownMs);
      return cloneSession(session);
    }
    current.verified = true;
    if (session.factors.every((factor) => factor.verified)) {
      session.complete = true;
      session.unlockedUntil = unlockExpiry(lock.unlockDuration, now);
      for (const factor of session.factors) {
        this.attemptBudgets.get(lockId)?.set(factor.factor, 0);
        this.state.saveAttempt(lockId, factor.factor, 0);
        this.state.saveCooldown(lockId, factor.factor, 0);
      }
    }
    return cloneSession(session);
  }

  isUnlocked(lockId: string, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session?.lockId !== lockId) return false;
    if (!session?.complete) return false;
    return session.unlockedUntil === null || session.unlockedUntil > this.now();
  }

  relock(lockId: string, sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.lockId === lockId) this.sessions.delete(sessionId);
  }

  async removeLock(lockId: string): Promise<void> {
    const lock = this.requireLock(lockId);
    for (const ref of Object.values(lock.credentialRefs)) {
      if (ref) await this.vault.delete(ref);
    }
    for (const [sessionId, session] of this.sessions) {
      if (session.lockId === lockId) this.sessions.delete(sessionId);
    }
    this.attemptBudgets.delete(lockId);
    this.locks.delete(lockId);
  }

  activate(lockId: string, sessionId: string, action: () => void): ActivationResult {
    const lock = this.requireLock(lockId);
    validateSessionId(sessionId);
    if (!this.isUnlocked(lockId, sessionId)) {
      return { kind: "authentication-required", lockId, elementId: lock.elementId };
    }
    action();
    return { kind: "activated" };
  }

  private requireLock(lockId: string): InternalLockRecord {
    const lock = this.locks.get(lockId);
    if (!lock) throw new Error(`Unknown lock: ${lockId}`);
    return lock;
  }
}

function validateDuration(duration: UnlockDuration): void {
  if (duration.kind === "minutes" && (!Number.isInteger(duration.minutes) || duration.minutes < 1 || duration.minutes > 24 * 60)) {
    throw new Error("Unlock duration must be a whole number of minutes between 1 and 1440");
  }
}

function unlockExpiry(duration: UnlockDuration, now: number): number | null {
  return duration.kind === "minutes" ? now + duration.minutes * 60_000 : null;
}

function summarizeLock(lock: InternalLockRecord): LockSummary {
  const { credentialRefs: _credentialRefs, ...summary } = lock;
  return { ...summary, unlockDuration: { ...lock.unlockDuration }, totp: lock.totp ? { ...lock.totp } : undefined };
}

function cloneSession(session: UnlockSession): UnlockSession {
  return { ...session, factors: session.factors.map((factor) => ({ ...factor })) };
}

function validateSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) throw new Error("Session ID must be 8 to 80 safe characters");
}
