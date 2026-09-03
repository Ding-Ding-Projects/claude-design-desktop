import { randomId } from "./vault";

export type LadderRung = "dish" | "sums" | "moles" | "clock";
export type LadderAnswer = { kind: "dish"; choice: number } | { kind: "sums"; answers: number[] };
export type MoleHitResult = {
  accepted: boolean;
  complete: boolean;
  revision?: number;
  reason?: "wrong-rung" | "early" | "late" | "wrong-cell" | "replay" | "stale" | "invalid";
  clearedWaiting: boolean;
  sessionCookieIssued: false;
};

export type LadderChallenge = {
  nonce: string;
  revision: number;
  rung: LadderRung;
  expiresAt: number;
  dishChoices?: string[];
  sums?: Array<{ left: number; right: number }>;
  moleRound?: { startedAt: number; durationMs: number; moles: Array<{ id: string; cell: number; visibleAt: number; hiddenAt: number }> };
};

export type LadderResult = {
  clearedWaiting: boolean;
  sessionCookieIssued: false;
  attemptsRestored: 0;
  next?: LadderChallenge;
  rung: LadderRung;
  reason?: "wrong-answer" | "expired" | "too-early" | "invalid" | "budget-exhausted";
};

type Lockout = { waitingUntil: number; attemptsRemaining: number; maxAttempts: number };
type ActiveChallenge = LadderChallenge & { userId: string; sessionId: string; moleHits?: string[]; correctDish?: number; wrongDishes?: number };

export interface LadderAuthorityAdapter {
  readBudget(userId: string): number[];
  writeBudget(userId: string, starts: number[]): void;
  startLadder(userId: string, sessionId: string, lockout: Lockout, now: number, maxSkipsPerHour: number, challenge: ActiveChallenge): boolean;
  consumeChallenge(userId: string, sessionId: string, nonce: string): ActiveChallenge | undefined;
  insertChallenge(challenge: ActiveChallenge): void;
  recordMoleHit(userId: string, sessionId: string, nonce: string, expectedRevision: number, moleId: string, cell: number, now: number): MoleHitResult;
  finishRound(userId: string, sessionId: string, nonce: string, expectedRevision: number, now: number): MoleHitResult;
  clearWait(userId: string, sessionId: string, rung: LadderRung): LadderResult;
}

export class MemoryLadderAuthority implements LadderAuthorityAdapter {
  private readonly budgets = new Map<string, number[]>();
  private readonly challenges = new Map<string, ActiveChallenge>();
  private readonly usedSessions = new Set<string>();
  private readonly lockouts = new Map<string, Lockout>();

  readBudget(userId: string): number[] { return [...(this.budgets.get(userId) ?? [])]; }
  writeBudget(userId: string, starts: number[]): void { this.budgets.set(userId, [...starts]); }
  startLadder(userId: string, sessionId: string, lockout: Lockout, now: number, maxSkipsPerHour: number, challenge: ActiveChallenge): boolean {
    if (lockout.waitingUntil <= now || lockout.attemptsRemaining < 1 || lockout.attemptsRemaining > lockout.maxAttempts || this.usedSessions.has(sessionId)) return false;
    const live = this.readBudget(userId).filter((value) => value > now - 60 * 60 * 1000);
    if (live.length >= maxSkipsPerHour) return false;
    this.budgets.set(userId, [...live, now]);
    this.lockouts.set(sessionId, { ...lockout });
    this.challenges.set(challenge.nonce, structuredClone(challenge));
    this.usedSessions.add(sessionId);
    return true;
  }
  consumeChallenge(userId: string, sessionId: string, nonce: string): ActiveChallenge | undefined {
    const challenge = this.challenges.get(nonce);
    if (!challenge || challenge.userId !== userId || challenge.sessionId !== sessionId) return undefined;
    this.challenges.delete(nonce);
    return structuredClone(challenge);
  }
  insertChallenge(challenge: ActiveChallenge): void {
    if (this.challenges.has(challenge.nonce)) throw new Error("Challenge nonce already exists");
    this.challenges.set(challenge.nonce, structuredClone(challenge));
  }
  recordMoleHit(userId: string, sessionId: string, nonce: string, expectedRevision: number, moleId: string, cell: number, now: number): MoleHitResult {
    const challenge = this.challenges.get(nonce);
    const rejected = (reason: MoleHitResult["reason"]): MoleHitResult => ({ accepted: false, complete: false, reason, clearedWaiting: false, sessionCookieIssued: false });
    if (!challenge || challenge.userId !== userId || challenge.sessionId !== sessionId || challenge.rung !== "moles") return rejected("wrong-rung");
    if (expectedRevision !== challenge.revision) return rejected("stale");
    const round = challenge.moleRound;
    if (!round || now < round.startedAt) return rejected("early");
    if (now >= challenge.expiresAt) { this.challenges.delete(nonce); return rejected("late"); }
    if (!Number.isSafeInteger(cell) || cell < 0 || cell > 63 || moleId.length > 120) return rejected("invalid");
    const mole = round.moles.find((candidate) => candidate.id === moleId);
    if (!mole || mole.cell !== cell || now < mole.visibleAt || now > mole.hiddenAt) return rejected("wrong-cell");
    const key = `${moleId}:${cell}`;
    const hits = new Set(challenge.moleHits ?? []);
    if (hits.has(key)) return rejected("replay");
    if (hits.size >= round.moles.length) return rejected("invalid");
    hits.add(key);
    challenge.moleHits = [...hits];
    challenge.revision += 1;
    this.challenges.set(nonce, structuredClone(challenge));
    return { accepted: true, complete: hits.size === round.moles.length, revision: challenge.revision, clearedWaiting: false, sessionCookieIssued: false };
  }
  finishRound(userId: string, sessionId: string, nonce: string, expectedRevision: number, now: number): MoleHitResult {
    const challenge = this.challenges.get(nonce);
    const rejected = (reason: MoleHitResult["reason"]): MoleHitResult => ({ accepted: false, complete: false, reason, clearedWaiting: false, sessionCookieIssued: false });
    if (!challenge || challenge.userId !== userId || challenge.sessionId !== sessionId || challenge.rung !== "moles") return rejected("wrong-rung");
    if (expectedRevision !== challenge.revision) return rejected("stale");
    const round = challenge.moleRound;
    if (!round || now < round.startedAt + round.durationMs) return rejected("early");
    if (now >= challenge.expiresAt) { this.challenges.delete(nonce); return rejected("late"); }
    if ((challenge.moleHits?.length ?? 0) !== round.moles.length) { this.challenges.delete(nonce); return rejected("invalid"); }
    this.challenges.delete(nonce);
    const cleared = this.clearWait(userId, sessionId, "moles");
    return { accepted: cleared.clearedWaiting, complete: cleared.clearedWaiting, clearedWaiting: cleared.clearedWaiting, sessionCookieIssued: false };
  }
  clearWait(_userId: string, sessionId: string, rung: LadderRung): LadderResult {
    if (!this.lockouts.has(sessionId)) return { clearedWaiting: false, sessionCookieIssued: false, attemptsRestored: 0, rung, reason: "invalid" };
    this.lockouts.delete(sessionId);
    return { clearedWaiting: true, sessionCookieIssued: false, attemptsRestored: 0, rung };
  }
}

export class UnlockLadderServer {
  private readonly authority: LadderAuthorityAdapter;
  private readonly now: () => number;
  private readonly maxSkipsPerHour: number;
  private readonly random: () => number;
  constructor(options: { now?: () => number; maxSkipsPerHour?: number; random?: () => number; authority: LadderAuthorityAdapter }) {
    this.now = options.now ?? (() => Date.now());
    this.maxSkipsPerHour = options.maxSkipsPerHour ?? 3;
    this.random = options.random ?? Math.random;
    this.authority = options.authority;
  }
  begin(userId: string, sessionId: string, lockout: Lockout, schoolMode = false): LadderChallenge | undefined {
    validateSessionId(sessionId);
    const now = this.now();
    const challenge = this.issue(userId, sessionId, schoolMode ? "sums" : "dish", now, 0);
    return this.authority.startLadder(userId, sessionId, lockout, now, this.maxSkipsPerHour, challenge) ? publicChallenge(challenge) : undefined;
  }
  submit(userId: string, sessionId: string, nonce: string, answer: LadderAnswer): LadderResult {
    validateSessionId(sessionId);
    const challenge = this.authority.consumeChallenge(userId, sessionId, nonce);
    if (!challenge) return failed("clock", "invalid");
    const now = this.now();
    if (challenge.expiresAt <= now) return failed(challenge.rung, "expired");
    if (challenge.rung === "dish" && answer.kind === "dish") {
      if (answer.choice === challenge.correctDish) return this.authority.clearWait(userId, sessionId, "dish");
      const wrongDishes = (challenge.wrongDishes ?? 0) + 1;
      return this.next(challenge, wrongDishes >= 5 ? "sums" : "dish", now, wrongDishes);
    }
    if (challenge.rung === "sums" && answer.kind === "sums") {
      const expected = challenge.sums?.map((sum) => sum.left + sum.right) ?? [];
      if (answer.answers.length === expected.length && answer.answers.every((value, index) => value === expected[index])) return this.authority.clearWait(userId, sessionId, "sums");
      return this.next(challenge, "moles", now, 0);
    }
    return failed(challenge.rung, "invalid");
  }
  submitMoleHit(userId: string, sessionId: string, nonce: string, expectedRevision: number, moleId: string, cell: number): MoleHitResult {
    validateSessionId(sessionId);
    return this.authority.recordMoleHit(userId, sessionId, nonce, expectedRevision, moleId, cell, this.now());
  }
  finishMoleRound(userId: string, sessionId: string, nonce: string, expectedRevision: number): MoleHitResult {
    validateSessionId(sessionId);
    return this.authority.finishRound(userId, sessionId, nonce, expectedRevision, this.now());
  }
  remainingBudget(userId: string): number {
    const current = this.authority.readBudget(userId).filter((value) => value > this.now() - 60 * 60 * 1000);
    this.authority.writeBudget(userId, current);
    return Math.max(0, this.maxSkipsPerHour - current.length);
  }
  private issue(userId: string, sessionId: string, rung: LadderRung, now: number, wrongDishes: number): ActiveChallenge {
    const challenge: ActiveChallenge = { userId, sessionId, nonce: randomId("ladder"), revision: 0, rung, expiresAt: now + 120_000 };
    if (rung === "dish") { challenge.dishChoices = ["Steamed shrimp dumpling", "Turnip cake", "Custard tart", "Rice noodle roll"]; challenge.correctDish = Math.floor(this.random() * challenge.dishChoices.length); challenge.wrongDishes = wrongDishes; }
    else if (rung === "sums") challenge.sums = Array.from({ length: 10 }, (_, index) => ({ left: (index % 5) + 1, right: ((index * 3) % 9) + 1 }));
    else if (rung === "moles") { const durationMs = 10_000; challenge.expiresAt = now + durationMs + 120_000; challenge.moleRound = { startedAt: now, durationMs, moles: Array.from({ length: 5 }, (_, index) => ({ id: `${challenge.nonce}_mole_${index}`, cell: index, visibleAt: now + index * 1_500, hiddenAt: now + index * 1_500 + 4_000 })) }; challenge.moleHits = []; }
    return challenge;
  }
  private next(challenge: ActiveChallenge, rung: LadderRung, now: number, wrongDishes: number): LadderResult {
    const next = this.issue(challenge.userId, challenge.sessionId, rung, now, wrongDishes);
    this.authority.insertChallenge(next);
    return { clearedWaiting: false, sessionCookieIssued: false, attemptsRestored: 0, rung, next: publicChallenge(next), reason: "wrong-answer" };
  }
}

function publicChallenge(challenge: LadderChallenge): LadderChallenge {
  const { userId: _userId, sessionId: _sessionId, correctDish: _correctDish, ...safe } = challenge as LadderChallenge & { userId?: string; sessionId?: string; correctDish?: number };
  return JSON.parse(JSON.stringify(safe)) as LadderChallenge;
}
function failed(rung: LadderRung, reason: LadderResult["reason"]): LadderResult { return { clearedWaiting: false, sessionCookieIssued: false, attemptsRestored: 0, rung, reason }; }
function validateSessionId(sessionId: string): void { if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) throw new Error("Session ID must be 8 to 80 safe characters"); }
