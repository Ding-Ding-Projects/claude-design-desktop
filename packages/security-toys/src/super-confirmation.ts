import { randomId } from "./vault";

export type SuperConfirmationState = {
  operationId: string;
  action: string;
  affectedData: string;
  firstKeyVerified: boolean;
  secondKeyVerified: boolean;
  sliderPercent: number;
  canConfirm: boolean;
  expired: boolean;
  used: boolean;
};

export type KeyVerifier = (slot: "first" | "second", value: string, operationId: string) => Promise<boolean>;

export class SuperConfirmation {
  private readonly action: string;
  private readonly affectedData: string;
  private readonly verifyKey: KeyVerifier;
  private readonly operationId: string;
  private readonly expiresAt: number;
  private readonly now: () => number;
  private firstKeyVerified = false;
  private secondKeyVerified = false;
  private sliderPercent = 0;
  private used = false;

  constructor(action: string, affectedData: string, verifyKey: KeyVerifier, options: { operationId?: string; expiresInMs?: number; now?: () => number } = {}) {
    if (!action.trim() || !affectedData.trim()) throw new Error("Action and affected data are required");
    this.action = action;
    this.affectedData = affectedData;
    this.verifyKey = verifyKey;
    this.operationId = options.operationId ?? randomId("operation");
    this.now = options.now ?? (() => Date.now());
    const expiresInMs = options.expiresInMs ?? 120_000;
    if (!Number.isInteger(expiresInMs) || expiresInMs < 1 || expiresInMs > 15 * 60_000) throw new Error("Confirmation expiry is out of bounds");
    this.expiresAt = this.now() + expiresInMs;
  }

  async submitKey(slot: "first" | "second", value: string): Promise<SuperConfirmationState> {
    if (this.used || this.isExpired()) return this.state();
    const verified = await this.verifyKey(slot, value, this.operationId);
    if (slot === "first") this.firstKeyVerified = verified;
    else this.secondKeyVerified = verified;
    if (!this.firstKeyVerified || !this.secondKeyVerified) this.sliderPercent = 0;
    return this.state();
  }

  setSlider(percent: number): SuperConfirmationState {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("Confirmation slider must be between 0 and 100");
    this.sliderPercent = this.firstKeyVerified && this.secondKeyVerified && !this.isExpired() && !this.used ? Math.round(percent) : 0;
    return this.state();
  }

  cancel(): SuperConfirmationState {
    this.firstKeyVerified = false;
    this.secondKeyVerified = false;
    this.sliderPercent = 0;
    return this.state();
  }

  confirm(): { authorized: true; action: string; affectedData: string } {
    if (!this.state().canConfirm) throw new Error("Both independent keys and the full confirmation slider are required");
    this.used = true;
    return { authorized: true, action: this.action, affectedData: this.affectedData };
  }

  state(): SuperConfirmationState {
    return {
      operationId: this.operationId,
      action: this.action,
      affectedData: this.affectedData,
      firstKeyVerified: this.firstKeyVerified,
      secondKeyVerified: this.secondKeyVerified,
      sliderPercent: this.sliderPercent,
      canConfirm: this.firstKeyVerified && this.secondKeyVerified && this.sliderPercent === 100 && !this.isExpired() && !this.used,
      expired: this.isExpired(),
      used: this.used
    };
  }

  private isExpired(): boolean { return this.now() >= this.expiresAt; }
}
