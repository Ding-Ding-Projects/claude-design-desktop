export type SuperConfirmationState = {
  action: string;
  affectedData: string;
  firstKeyVerified: boolean;
  secondKeyVerified: boolean;
  sliderPercent: number;
  canConfirm: boolean;
};

export type KeyVerifier = (slot: "first" | "second", value: string) => Promise<boolean>;

export class SuperConfirmation {
  private readonly action: string;
  private readonly affectedData: string;
  private readonly verifyKey: KeyVerifier;
  private firstKeyVerified = false;
  private secondKeyVerified = false;
  private sliderPercent = 0;

  constructor(action: string, affectedData: string, verifyKey: KeyVerifier) {
    if (!action.trim() || !affectedData.trim()) throw new Error("Action and affected data are required");
    this.action = action;
    this.affectedData = affectedData;
    this.verifyKey = verifyKey;
  }

  async submitKey(slot: "first" | "second", value: string): Promise<SuperConfirmationState> {
    const verified = await this.verifyKey(slot, value);
    if (slot === "first") this.firstKeyVerified = verified;
    else this.secondKeyVerified = verified;
    if (!this.firstKeyVerified || !this.secondKeyVerified) this.sliderPercent = 0;
    return this.state();
  }

  setSlider(percent: number): SuperConfirmationState {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("Confirmation slider must be between 0 and 100");
    this.sliderPercent = this.firstKeyVerified && this.secondKeyVerified ? Math.round(percent) : 0;
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
    return { authorized: true, action: this.action, affectedData: this.affectedData };
  }

  state(): SuperConfirmationState {
    return {
      action: this.action,
      affectedData: this.affectedData,
      firstKeyVerified: this.firstKeyVerified,
      secondKeyVerified: this.secondKeyVerified,
      sliderPercent: this.sliderPercent,
      canConfirm: this.firstKeyVerified && this.secondKeyVerified && this.sliderPercent === 100
    };
  }
}
