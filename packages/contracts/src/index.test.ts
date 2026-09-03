import { describe, expect, it } from "vitest";
import { isAccountEvent } from "./index";

const account = { slotId: "slot-1", label: "Local", email: null, planType: null, state: "signedOut", lastVerifiedAt: null } as const;

describe("isAccountEvent", () => {
  it("accepts exact account event shapes", () => expect(isAccountEvent({ type: "updated", account })).toBe(true));
  it("rejects additional fields and unknown states", () => {
    expect(isAccountEvent({ type: "updated", account, extra: true })).toBe(false);
    expect(isAccountEvent({ type: "updated", account: { ...account, state: "connected" } })).toBe(false);
  });
});
