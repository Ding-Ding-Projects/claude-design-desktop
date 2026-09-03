import type { AppRouteEvent, ProtocolRoute } from "../../../packages/contracts/src/index";

export function protocolRouteEvent(route: ProtocolRoute, deliveryId: string): AppRouteEvent {
  if (route.type === "open-project") return { version: 1, deliveryId, route, status: "unavailable", message: "Project host is unavailable until integration completes" };
  return { version: 1, deliveryId, route, status: "navigate" };
}
