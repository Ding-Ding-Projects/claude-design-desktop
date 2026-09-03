import { describe, expect, it } from "vitest";
import { acknowledgeRoute, beginRouteDelivery, canDeliverRoute, type RouteLifecycle } from "./route-lifecycle";

const initial: RouteLifecycle = { rendererLoaded: false, rendererAcknowledged: false, pendingRoute: { type: "home" }, inFlightDeliveryId: null };

describe("route lifecycle", () => {
  it("holds a process.argv route until both page load and React acknowledgement", () => {
    expect(canDeliverRoute(initial)).toBe(false);
    const loaded = { ...initial, rendererLoaded: true };
    expect(canDeliverRoute(loaded)).toBe(false);
    const acknowledged = { ...loaded, rendererAcknowledged: true };
    expect(canDeliverRoute(acknowledged)).toBe(true);
    const sent = beginRouteDelivery(acknowledged, "route-1");
    expect(sent.pendingRoute).toEqual({ type: "home" });
    expect(sent.inFlightDeliveryId).toBe("route-1");
  });

  it("clears the pending route only after its delivery is acknowledged", () => {
    const sent = beginRouteDelivery({ ...initial, rendererLoaded: true, rendererAcknowledged: true }, "route-1");
    expect(acknowledgeRoute(sent, "wrong-id")).toEqual(sent);
    expect(acknowledgeRoute(sent, "route-1")).toMatchObject({ pendingRoute: null, inFlightDeliveryId: null });
  });
});
