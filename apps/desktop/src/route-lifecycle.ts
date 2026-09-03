import type { ProtocolRoute } from "../../../packages/contracts/src/index";

export type RouteLifecycle = {
  rendererLoaded: boolean;
  rendererAcknowledged: boolean;
  pendingRoute: ProtocolRoute | null;
  inFlightDeliveryId: string | null;
};

export function canDeliverRoute(state: RouteLifecycle) {
  return state.rendererLoaded && state.rendererAcknowledged && state.pendingRoute !== null && state.inFlightDeliveryId === null;
}

export function beginRouteDelivery(state: RouteLifecycle, deliveryId: string) {
  if (!canDeliverRoute(state)) return state;
  return { ...state, inFlightDeliveryId: deliveryId };
}

export function acknowledgeRoute(state: RouteLifecycle, deliveryId: string) {
  if (state.inFlightDeliveryId !== deliveryId) return state;
  return { ...state, pendingRoute: null, inFlightDeliveryId: null };
}
