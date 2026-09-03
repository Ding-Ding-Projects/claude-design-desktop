import { describe, expect, it } from "vitest";
import { isAccountEvent, isAppRouteEvent } from "./index";

const account = { slotId: "slot-1", label: "Local", email: null, planType: null, state: "signedOut", lastVerifiedAt: null } as const;

describe("isAccountEvent", () => {
  it("accepts exact account event shapes", () => expect(isAccountEvent({ type: "updated", account })).toBe(true));
  it("rejects additional fields and unknown states", () => {
    expect(isAccountEvent({ type: "updated", account, extra: true })).toBe(false);
    expect(isAccountEvent({ type: "updated", account: { ...account, state: "connected" } })).toBe(false);
  });
  it("rejects unbounded DTO strings", () => {
    expect(isAccountEvent({ type: "updated", account: { ...account, slotId: "x".repeat(129) } })).toBe(false);
    expect(isAccountEvent({ type: "error", slotId: "slot-1", message: "x".repeat(241) })).toBe(false);
  });
});

describe("isAppRouteEvent", () => {
  it("accepts a bounded acknowledged route event", () => expect(isAppRouteEvent({ version: 1, deliveryId: "route-1", route: { type: "home" }, status: "navigate" })).toBe(true));
  it("rejects an unbounded delivery id", () => expect(isAppRouteEvent({ version: 1, deliveryId: "x".repeat(129), route: { type: "home" }, status: "navigate" })).toBe(false));
});
