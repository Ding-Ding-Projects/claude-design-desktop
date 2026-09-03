import {
  LOCK_POLICY_FACTORS,
  type FactorState,
  type LockFactor,
  type LockPolicy,
  type LockRecord,
  type UnlockDuration,
  type UnlockSession
} from "./types";
import { randomId, SecretVault, storeHashedSecret, verifySecret } from "./vault";
import { verifyTotpCode } from "./totp";

export const LOCK_DISCLOSURE = "This lock is for fun only. It is not security, encryption, or protection from another person using this computer.";

export type LockManagerOptions = {
  vault: SecretVault;
  now?: () => number;
  maxAttempts?: number;
};

export type ActivationResult =
  | { kind: "activated" }
  | { kind: "authentication-required"; lockId: string; elementId: string };

export class LockManager {
  private readonly locks = new Map<string, LockRecord>();
  private readonly sessions = new Map<string, UnlockSession>();
  private readonly vault: SecretVault;
  private readonly now: () => number;
  private readonly maxAttempts: number;

  constructor(options: LockManagerOptions) {
    this.vault = options.vault;
    this.now = options.now ?? (() => Date.now());
    this.maxAttempts = options.maxAttempts ?? 5;
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
  }): Promise<LockRecord> {
    const factors = LOCK_POLICY_FACTORS[input.policy];
    for (const factor of factors) {
      if (factor === "pin" && !input.pin) throw new Error("PIN is required by this policy");
      if (factor === "password" && !input.password) throw new Error("Password is required by this policy");
      if (factor === "totp" && !input.totpSecret) throw new Error("TOTP secret is required by this policy");
    }
    validateDuration(input.unlockDuration ?? { kind: "session" });
    if (!input.recoveryDirectory.trim()) throw new Error("A recovery directory is required");

    const id = randomId("lock");
    const credentialRefs: LockRecord["credentialRefs"] = {};
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
      await this.vault.put(ref, input.totpSecret);
      credentialRefs.totp = ref;
    }
    const record: LockRecord = {
      id,
      elementId: input.elementId,
      policy: input.policy,
      createdAt: this.now(),
      unlockDuration: input.unlockDuration ?? { kind: "session" },
      lockedOnLaunch: input.lockedOnLaunch ?? true,
      credentialRefs,
      disclosure: LOCK_DISCLOSURE,
      recoveryDirectory: input.recoveryDirectory
    };
    this.locks.set(id, record);
    return cloneLock(record);
  }

  listLocks(): LockRecord[] {
    return Array.from(this.locks.values(), cloneLock);
  }

  getLock(lockId: string): LockRecord | undefined {
    const record = this.locks.get(lockId);
    return record ? cloneLock(record) : undefined;
  }

  beginUnlock(lockId: string): UnlockSession {
    const lock = this.requireLock(lockId);
    const session: UnlockSession = {
      lockId,
      factors: LOCK_POLICY_FACTORS[lock.policy].map((factor): FactorState => ({ factor, verified: false, attempts: 0 })),
      startedAt: this.now(),
      unlockedUntil: null,
      complete: false
    };
    this.sessions.set(lockId, session);
    return cloneSession(session);
  }

  async verifyNextFactor(lockId: string, candidate: string, at = this.now()): Promise<UnlockSession> {
    const lock = this.requireLock(lockId);
    const session = this.sessions.get(lockId) ?? this.beginUnlock(lockId);
    const current = session.factors.find((factor) => !factor.verified);
    if (!current) return cloneSession(session);
    if (current.attempts >= this.maxAttempts) throw new Error("Attempt budget exhausted; use the documented recovery route");
    current.attempts += 1;
    const ref = lock.credentialRefs[current.factor];
    let valid = false;
    if (ref) {
      if (current.factor === "totp") {
        const secret = await this.vault.get(ref);
        valid = secret ? await verifyTotpCode(secret, candidate, { timestamp: at }) : false;
      } else {
        valid = await verifySecret(this.vault, ref, candidate);
      }
    }
    if (!valid) return cloneSession(session);
    current.verified = true;
    if (session.factors.every((factor) => factor.verified)) {
      session.complete = true;
      session.unlockedUntil = unlockExpiry(lock.unlockDuration, at);
    }
    return cloneSession(session);
  }

  isUnlocked(lockId: string, at = this.now()): boolean {
    const session = this.sessions.get(lockId);
    if (!session?.complete) return false;
    return session.unlockedUntil === null || session.unlockedUntil > at;
  }

  relock(lockId: string): void {
    this.sessions.delete(lockId);
  }

  async removeLock(lockId: string): Promise<void> {
    const lock = this.requireLock(lockId);
    for (const ref of Object.values(lock.credentialRefs)) {
      if (ref) await this.vault.delete(ref);
    }
    this.sessions.delete(lockId);
    this.locks.delete(lockId);
  }

  activate(lockId: string, action: () => void, at = this.now()): ActivationResult {
    const lock = this.requireLock(lockId);
    if (!this.isUnlocked(lockId, at)) {
      return { kind: "authentication-required", lockId, elementId: lock.elementId };
    }
    action();
    return { kind: "activated" };
  }

  private requireLock(lockId: string): LockRecord {
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

function cloneLock(lock: LockRecord): LockRecord {
  return { ...lock, credentialRefs: { ...lock.credentialRefs }, unlockDuration: { ...lock.unlockDuration } };
}

function cloneSession(session: UnlockSession): UnlockSession {
  return { ...session, factors: session.factors.map((factor) => ({ ...factor })) };
}
