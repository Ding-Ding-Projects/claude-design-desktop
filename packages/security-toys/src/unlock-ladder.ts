import { randomId } from "./vault";

export type LadderRung = "dish" | "sums" | "moles" | "clock";
export type LadderAnswer =
  | { kind: "dish"; choice: number }
  | { kind: "sums"; answers: number[] }
  | { kind: "moles"; hits: Array<{ moleId: string; cell: number; at: number }> };

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
type ActiveChallenge = LadderChallenge & { userId: string; sessionId: string };

export interface LadderAuthorityAdapter {
  readBudget(userId: string): number[];
  writeBudget(userId: string, starts: number[]): void;
  authorizeLadderStart(userId: string, sessionId: string, lockout: { waitingUntil: number; attemptsRemaining: number; maxAttempts: number }, now: number, maxSkipsPerHour: number, challenge: ActiveChallenge): boolean;
  readChallenge(nonce: string): ActiveChallenge | undefined;
  writeChallenge(challenge: ActiveChallenge): void;
  deleteChallenge(nonce: string): void;
}

export class MemoryLadderAuthority implements LadderAuthorityAdapter {
  private readonly budgets = new Map<string, number[]>();
  private readonly challenges = new Map<string, ActiveChallenge>();
  private readonly usedSessions = new Set<string>();
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
  readChallenge(nonce: string): ActiveChallenge | undefined { const value = this.challenges.get(nonce); return value ? structuredClone(value) : undefined; }
  writeChallenge(challenge: ActiveChallenge): void { this.challenges.set(challenge.nonce, structuredClone(challenge)); }
  deleteChallenge(nonce: string): void { this.challenges.delete(nonce); }
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
    if (!this.authority.authorizeLadderStart(userId, sessionId, lockout, now, this.maxSkipsPerHour, challenge)) return undefined;
    return publicChallenge(challenge);
  }

  submit(userId: string, sessionId: string, nonce: string, answer: LadderAnswer): LadderResult {
    validateSessionId(sessionId);
    const challenge = this.authority.readChallenge(nonce);
    if (!challenge || challenge.userId !== userId || challenge.sessionId !== sessionId) return failed("clock", "invalid");
    this.authority.deleteChallenge(nonce);
    const now = this.now();
    if (challenge.expiresAt <= now) return failed(challenge.rung, "expired");
    if (!isAnswerForRung(answer, challenge.rung)) return failed(challenge.rung, "invalid");

    if (challenge.rung === "dish") {
      const correct = answer.kind === "dish" && answer.choice === challenge.correctDish;
      if (correct) return cleared("dish");
      const wrongDishes = Number((challenge as ActiveChallenge & { wrongDishes?: number }).wrongDishes ?? 0) + 1;
      if (wrongDishes >= 5) return this.nextWithState(challenge, "sums", now, wrongDishes);
      return this.nextWithState(challenge, "dish", now, wrongDishes);
    }
    if (challenge.rung === "sums") {
      const expected = challenge.sums?.map((sum) => sum.left + sum.right) ?? [];
      if (answer.kind === "sums" && answer.answers.length === expected.length && answer.answers.every((value, index) => value === expected[index])) {
        return cleared("sums");
      }
      return this.nextWithState(challenge, "moles", now, 0);
    }
    if (challenge.rung === "moles") {
      const round = challenge.moleRound;
      if (!round || now < round.startedAt + round.durationMs) return failed("moles", "too-early");
      const uniqueHits = new Set<string>();
      const valid = answer.kind === "moles" && answer.hits.every((hit) => {
        const key = `${hit.moleId}:${hit.cell}`;
        const mole = round.moles.find((candidate) => candidate.id === hit.moleId && candidate.cell === hit.cell);
        if (uniqueHits.has(key) || !mole || hit.at > now || hit.at < mole.visibleAt || hit.at > mole.hiddenAt) return false;
        uniqueHits.add(key);
        return true;
      });
      return valid && uniqueHits.size >= round.moles.length ? cleared("moles") : failed("clock", "wrong-answer");
    }
    return failed("clock", "invalid");
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
  return (rung === "dish" && answer.kind === "dish") || (rung === "sums" && answer.kind === "sums") || (rung === "moles" && answer.kind === "moles");
}

function validateSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) throw new Error("Session ID must be 8 to 80 safe characters");
}
