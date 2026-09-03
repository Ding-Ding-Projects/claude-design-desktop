export type ConfirmationState = { firstKey: string; secondKey: string; progress: number; consumed: boolean };

export type ConfirmationAdapter = {
  state: ConfirmationState;
  setFirstKey(value: string): ConfirmationState;
  setSecondKey(value: string): ConfirmationState;
  setProgress(value: number): ConfirmationState;
  confirm(): { ok: boolean; state: ConfirmationState; reason?: string };
  cancel(): ConfirmationState;
};

export function createConfirmationAdapter(onConfirmed?: () => void): ConfirmationAdapter {
  const state: ConfirmationState = { firstKey: "", secondKey: "", progress: 0, consumed: false };
  const update = (changes: Partial<ConfirmationState>) => Object.assign(state, changes);
  return {
    state,
    setFirstKey: (value) => update({ firstKey: value }),
    setSecondKey: (value) => update({ secondKey: value }),
    setProgress: (value) => update({ progress: Math.max(0, Math.min(100, value)) }),
    confirm: () => {
      if (state.consumed) return { ok: false, state, reason: "Confirmation has already been used" };
      if (!state.firstKey || !state.secondKey) return { ok: false, state, reason: "Both confirmation keys are required" };
      if (state.progress < 100) return { ok: false, state, reason: "Move the confirmation slider to 100%" };
      state.consumed = true;
      onConfirmed?.();
      return { ok: true, state };
    },
    cancel: () => update({ firstKey: "", secondKey: "", progress: 0 })
  };
}

