export type LockPolicy =
  | "PIN"
  | "PASSWORD"
  | "PIN_PASSWORD"
  | "PASSWORD_TOTP"
  | "PIN_TOTP"
  | "PASSWORD_PIN_TOTP";

export type LockFactor = "pin" | "password" | "totp";

export const LOCK_POLICY_FACTORS: Readonly<Record<LockPolicy, readonly LockFactor[]>> = {
  PIN: ["pin"],
  PASSWORD: ["password"],
  PIN_PASSWORD: ["pin", "password"],
  PASSWORD_TOTP: ["password", "totp"],
  PIN_TOTP: ["pin", "totp"],
  PASSWORD_PIN_TOTP: ["password", "pin", "totp"]
};

export type UnlockDuration =
  | { kind: "session" }
  | { kind: "minutes"; minutes: number }
  | { kind: "until-close" };

export type LockRecord = {
  id: string;
  elementId: string;
  policy: LockPolicy;
  createdAt: number;
  unlockDuration: UnlockDuration;
  lockedOnLaunch: boolean;
  credentialRefs: Partial<Record<LockFactor, string>>;
  disclosure: string;
  recoveryDirectory: string;
};

export type FactorState = {
  factor: LockFactor;
  verified: boolean;
  attempts: number;
};

export type UnlockSession = {
  lockId: string;
  factors: FactorState[];
  startedAt: number;
  unlockedUntil: number | null;
  complete: boolean;
};

export type AuthenticatorAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export type TotpEntry = {
  id: string;
  issuer: string;
  account: string;
  algorithm: AuthenticatorAlgorithm;
  digits: 6 | 7 | 8;
  period: number;
  secretRef: string;
  createdAt: number;
};

export type RedactedTotpEntry = Omit<TotpEntry, "secretRef"> & { secretStored: true };

export type HistoryEntry = {
  id: string;
  action: "created" | "updated" | "deleted" | "restored" | "undone" | "imported" | "settings-changed";
  label: string;
  occurredAt: number;
  snapshotRef?: string;
  redacted: true;
};
