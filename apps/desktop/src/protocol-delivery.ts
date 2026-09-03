import type { AppRouteEvent, ProtocolRoute } from "../../../packages/contracts/src/index";

export function protocolRouteEvent(route: ProtocolRoute): AppRouteEvent {
  if (route.type === "open-project") return { version: 1, route, status: "unavailable", message: "Project host is unavailable until integration completes" };
  return { version: 1, route, status: "navigate" };
}
