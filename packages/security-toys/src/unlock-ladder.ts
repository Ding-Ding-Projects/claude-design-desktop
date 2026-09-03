import { randomId } from "./vault";

export type LadderRung = "dish" | "sums" | "moles" | "clock";
export type LadderAnswer =
  | { kind: "dish"; choice: number }
  | { kind: "sums"; answers: number[] };
export type MoleHitResult = { accepted: boolean; complete: boolean; reason?: "wrong-rung" | "early" | "late" | "wrong-cell" | "replay" | "invalid"; clearedWaiting: boolean; sessionCookieIssued: false };

export type LadderChallenge = {
  nonce: string;
  rung: LadderRung;
  expiresAt: number;
  dishChoices?: string[];
  correctDish?: number;
  sums?: Array<{ left: number; right: number }>;
  moleRound?: { startedAt: number; durationMs: number; moles: Array<{ id: string; cell: number; visibleAt: number; hiddenAt: number }> };
};

export type LadderResult = {
  clearedWaiting: boolean;
  sessionCookieIssued: false;
  attemptsRestored: number;
  next?: LadderChallenge;
  rung: LadderRung;
  reason?: "wrong-answer" | "expired" | "too-early" | "invalid" | "budget-exhausted";
};

type Lockout = { waitingUntil: number; attemptsRemaining: number; maxAttempts: number };
type ActiveChallenge = LadderChallenge & { userId: string; sessionId: string; moleHits?: string[] };

export interface LadderAuthorityAdapter {
  readBudget(userId: string): number[];
  writeBudget(userId: string, starts: number[]): void;
  authorizeLadderStart(userId: string, sessionId: string, lockout: { waitingUntil: number; attemptsRemaining: number; maxAttempts: number }, now: number, maxSkipsPerHour: number, challenge: ActiveChallenge): boolean;
  readChallenge(nonce: string): ActiveChallenge | undefined;
  writeChallenge(challenge: ActiveChallenge): void;
  deleteChallenge(nonce: string): void;
  startLadder?(userId: string, sessionId: string, lockout: Lockout, now: number, maxSkipsPerHour: number, challenge: ActiveChallenge): boolean;
  consumeChallenge?(userId: string, sessionId: string, nonce: string): ActiveChallenge | undefined;
  clearWaiting?(userId: string, sessionId: string, rung: LadderRung): LadderResult;
}

export class MemoryLadderAuthority implements LadderAuthorityAdapter {
  private readonly budgets = new Map<string, number[]>();
  private readonly challenges = new Map<string, ActiveChallenge>();
  private readonly usedSessions = new Set<string>();
  private readonly lockouts = new Map<string, Lockout>();
  readBudget(userId: string): number[] { return [...(this.budgets.get(userId) ?? [])]; }
  writeBudget(userId: string, starts: number[]): void { this.budgets.set(userId, [...starts]); }
  authorizeLadderStart(userId: string, sessionId: string, lockout: Lockout, now: number, maxSkipsPerHour: number, challenge: ActiveChallenge): boolean {
    if (lockout.waitingUntil <= now || lockout.attemptsRemaining < 1 || lockout.attemptsRemaining > lockout.maxAttempts) return false;
    if (this.usedSessions.has(sessionId)) return false;
    const current = this.budgets.get(userId) ?? [];
    const live = current.filter((value) => value > now - 60 * 60 * 1000);
    if (live.length >= maxSkipsPerHour) return false;
    this.budgets.set(userId, [...live, now]);
    this.challenges.set(challenge.nonce, structuredClone(challenge));
    this.usedSessions.add(sessionId);
    return true;
  }
  startLadder(userId: string, sessionId: string, lockout: Lockout, now: number, maxSkipsPerHour: number, challenge: ActiveChallenge): boolean {
    if (!this.authorizeLadderStart(userId, sessionId, lockout, now, maxSkipsPerHour, challenge)) return false;
    this.lockouts.set(sessionId, { ...lockout });
    return true;
  }
  readChallenge(nonce: string): ActiveChallenge | undefined { const value = this.challenges.get(nonce); return value ? structuredClone(value) : undefined; }
  writeChallenge(challenge: ActiveChallenge): void { this.challenges.set(challenge.nonce, structuredClone(challenge)); }
  deleteChallenge(nonce: string): void { this.challenges.delete(nonce); }
  consumeChallenge(userId: string, sessionId: string, nonce: string): ActiveChallenge | undefined {
    const challenge = this.challenges.get(nonce);
    if (!challenge || challenge.userId !== userId || challenge.sessionId !== sessionId) return undefined;
    this.challenges.delete(nonce);
    return structuredClone(challenge);
  }
  clearWaiting(userId: string, sessionId: string, rung: LadderRung): LadderResult {
    if (!this.lockouts.has(sessionId)) return failed(rung, "invalid");
    this.lockouts.delete(sessionId);
    return cleared(rung);
  }
}

export class UnlockLadderServer {
  private readonly authority: LadderAuthorityAdapter;
  private readonly now: () => number;
  private readonly maxSkipsPerHour: number;
  private readonly random: () => number;

  constructor(options: { now?: () => number; maxSkipsPerHour?: number; random?: () => number; authority?: LadderAuthorityAdapter } = {}) {
    this.now = options.now ?? (() => Date.now());
    this.maxSkipsPerHour = options.maxSkipsPerHour ?? 3;
    this.random = options.random ?? Math.random;
    this.authority = options.authority ?? new MemoryLadderAuthority();
  }

  begin(userId: string, sessionId: string, lockout: Lockout, schoolMode = false): LadderChallenge | undefined {
    validateSessionId(sessionId);
    const now = this.now();
    if (lockout.waitingUntil <= now) return undefined;
    const rung: LadderRung = schoolMode ? "sums" : "dish";
    const challenge = this.issue(userId, sessionId, rung, now, 0, false);
    const allowed = this.authority.startLadder
      ? this.authority.startLadder(userId, sessionId, lockout, now, this.maxSkipsPerHour, challenge)
      : this.authority.authorizeLadderStart(userId, sessionId, lockout, now, this.maxSkipsPerHour, challenge);
    if (!allowed) return undefined;
    return publicChallenge(challenge);
  }

  submit(userId: string, sessionId: string, nonce: string, answer: LadderAnswer): LadderResult {
    validateSessionId(sessionId);
    const challenge = this.authority.consumeChallenge
      ? this.authority.consumeChallenge(userId, sessionId, nonce)
      : this.authority.readChallenge(nonce);
    if (!challenge || challenge.userId !== userId || challenge.sessionId !== sessionId) return failed("clock", "invalid");
    if (!this.authority.consumeChallenge) this.authority.deleteChallenge(nonce);
    const now = this.now();
    if (challenge.expiresAt <= now) return failed(challenge.rung, "expired");
    if (!isAnswerForRung(answer, challenge.rung)) return failed(challenge.rung, "invalid");

    if (challenge.rung === "dish") {
      const correct = answer.kind === "dish" && answer.choice === challenge.correctDish;
      if (correct) return this.clearWaiting(userId, sessionId, "dish");
      const wrongDishes = Number((challenge as ActiveChallenge & { wrongDishes?: number }).wrongDishes ?? 0) + 1;
      if (wrongDishes >= 5) return this.nextWithState(challenge, "sums", now, wrongDishes);
      return this.nextWithState(challenge, "dish", now, wrongDishes);
    }
    if (challenge.rung === "sums") {
      const expected = challenge.sums?.map((sum) => sum.left + sum.right) ?? [];
      if (answer.kind === "sums" && answer.answers.length === expected.length && answer.answers.every((value, index) => value === expected[index])) {
        return this.clearWaiting(userId, sessionId, "sums");
      }
      return this.nextWithState(challenge, "moles", now, 0);
    }
    if (challenge.rung === "moles") {
      return failed("moles", "invalid");
    }
    return failed("clock", "invalid");
  }

  submitMoleHit(userId: string, sessionId: string, nonce: string, moleId: string, cell: number): MoleHitResult {
    validateSessionId(sessionId);
    if (!Number.isSafeInteger(cell) || cell < 0 || cell > 63 || moleId.length > 120) return { accepted: false, complete: false, reason: "invalid", clearedWaiting: false, sessionCookieIssued: false };
    const challenge = this.authority.readChallenge(nonce);
    if (!challenge || challenge.userId !== userId || challenge.sessionId !== sessionId || challenge.rung !== "moles") return { accepted: false, complete: false, reason: "wrong-rung", clearedWaiting: false, sessionCookieIssued: false };
    const now = this.now();
    const round = challenge.moleRound;
    if (!round || now < round.startedAt) return { accepted: false, complete: false, reason: "early", clearedWaiting: false, sessionCookieIssued: false };
    if (now >= challenge.expiresAt) { this.authority.deleteChallenge(nonce); return { accepted: false, complete: false, reason: "late", clearedWaiting: false, sessionCookieIssued: false }; }
    const mole = round.moles.find((candidate) => candidate.id === moleId);
    if (!mole || mole.cell !== cell || now < mole.visibleAt || now > mole.hiddenAt) return { accepted: false, complete: false, reason: "wrong-cell", clearedWaiting: false, sessionCookieIssued: false };
    const key = `${moleId}:${cell}`;
    const hits = new Set(challenge.moleHits ?? []);
    if (hits.has(key)) return { accepted: false, complete: false, reason: "replay", clearedWaiting: false, sessionCookieIssued: false };
    if (hits.size >= round.moles.length) return { accepted: false, complete: false, reason: "invalid", clearedWaiting: false, sessionCookieIssued: false };
    hits.add(key);
    challenge.moleHits = [...hits];
    if (hits.size === round.moles.length) {
      this.authority.writeChallenge(challenge);
      return { accepted: true, complete: false, clearedWaiting: false, sessionCookieIssued: false };
    }
    this.authority.writeChallenge(challenge);
    return { accepted: true, complete: false, clearedWaiting: false, sessionCookieIssued: false };
  }

  finishMoleRound(userId: string, sessionId: string, nonce: string): MoleHitResult {
    validateSessionId(sessionId);
    const challenge = this.authority.readChallenge(nonce);
    if (!challenge || challenge.userId !== userId || challenge.sessionId !== sessionId || challenge.rung !== "moles") return { accepted: false, complete: false, reason: "wrong-rung", clearedWaiting: false, sessionCookieIssued: false };
    const round = challenge.moleRound;
    const now = this.now();
    if (!round || now < round.startedAt + round.durationMs) return { accepted: false, complete: false, reason: "early", clearedWaiting: false, sessionCookieIssued: false };
    if (now >= challenge.expiresAt) { this.authority.deleteChallenge(nonce); return { accepted: false, complete: false, reason: "late", clearedWaiting: false, sessionCookieIssued: false }; }
    if ((challenge.moleHits?.length ?? 0) !== round.moles.length) { this.authority.deleteChallenge(nonce); return { accepted: false, complete: false, reason: "invalid", clearedWaiting: false, sessionCookieIssued: false }; }
    this.authority.deleteChallenge(nonce);
    const cleared = this.clearWaiting(userId, sessionId, "moles");
    return { accepted: true, complete: cleared.clearedWaiting, clearedWaiting: cleared.clearedWaiting, sessionCookieIssued: false };
  }

  remainingBudget(userId: string): number {
    const cutoff = this.now() - 60 * 60 * 1000;
    const current = this.authority.readBudget(userId).filter((value) => value > cutoff);
    this.authority.writeBudget(userId, current);
    return Math.max(0, this.maxSkipsPerHour - current.length);
  }

  private issue(userId: string, sessionId: string, rung: LadderRung, now: number, wrongDishes: number, persist = true): ActiveChallenge {
    const nonce = randomId("ladder");
    const challenge: ActiveChallenge = { userId, sessionId, nonce, rung, expiresAt: now + 120_000 };
    if (rung === "dish") {
      challenge.dishChoices = ["Steamed shrimp dumpling", "Turnip cake", "Custard tart", "Rice noodle roll"];
      challenge.correctDish = Math.floor(this.random() * challenge.dishChoices.length);
      (challenge as ActiveChallenge & { wrongDishes?: number }).wrongDishes = wrongDishes;
    } else if (rung === "sums") {
      challenge.sums = Array.from({ length: 10 }, (_, index) => ({ left: (index % 5) + 1, right: ((index * 3) % 9) + 1 }));
    } else if (rung === "moles") {
      const start = now;
      const durationMs = 10_000;
      challenge.expiresAt = start + durationMs + 120_000;
      challenge.moleRound = {
        startedAt: start,
        durationMs,
        moles: Array.from({ length: 5 }, (_, index) => ({ id: `${nonce}_mole_${index}`, cell: index, visibleAt: start + index * 1_500, hiddenAt: start + index * 1_500 + 4_000 }))
      };
    }
    if (persist) this.authority.writeChallenge(challenge);
    return challenge;
  }

  private nextWithState(challenge: ActiveChallenge, rung: LadderRung, now: number, wrongDishes: number): LadderResult {
    const next = this.issue(challenge.userId, challenge.sessionId, rung, now, wrongDishes);
    return { clearedWaiting: false, sessionCookieIssued: false, attemptsRestored: 0, rung, next: publicChallenge(next), reason: "wrong-answer" };
  }

  private clearWaiting(userId: string, sessionId: string, rung: LadderRung): LadderResult {
    return this.authority.clearWaiting ? this.authority.clearWaiting(userId, sessionId, rung) : cleared(rung);
  }
}

function publicChallenge(challenge: LadderChallenge): LadderChallenge {
  const { userId: _userId, sessionId: _sessionId, correctDish: _correctDish, ...safe } = challenge as LadderChallenge & { userId?: string; sessionId?: string };
  return JSON.parse(JSON.stringify(safe)) as LadderChallenge;
}

function cleared(rung: LadderRung): LadderResult {
  return { clearedWaiting: true, sessionCookieIssued: false, attemptsRestored: 0, rung };
}

function failed(rung: LadderRung, reason: LadderResult["reason"]): LadderResult {
  return { clearedWaiting: false, sessionCookieIssued: false, attemptsRestored: 0, rung, reason };
}

function isAnswerForRung(answer: LadderAnswer, rung: LadderRung): boolean {
  return (rung === "dish" && answer.kind === "dish") || (rung === "sums" && answer.kind === "sums");
}

function validateSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) throw new Error("Session ID must be 8 to 80 safe characters");
}
