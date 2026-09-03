import { describe, expect, it } from "vitest";
import { protocolRouteEvent } from "./protocol-delivery";

describe("protocolRouteEvent", () => {
  it("delivers home navigation after renderer readiness", () => expect(protocolRouteEvent({ type: "home" }, "route-1")).toEqual({ version: 1, deliveryId: "route-1", route: { type: "home" }, status: "navigate" }));
  it("reports an explicit unavailable project host", () => expect(protocolRouteEvent({ type: "open-project", projectId: "project_1" }, "route-2")).toEqual({ version: 1, deliveryId: "route-2", route: { type: "open-project", projectId: "project_1" }, status: "unavailable", message: "Project host is unavailable until integration completes" }));
});
