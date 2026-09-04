/** One authoritative action route shared by pointer, keyboard, touch, assistive, and palette callers. */
export function routeActivation(locked: boolean, onActivate: () => void, onUnlockRequest: () => void): void {
  if (locked) onUnlockRequest();
  else onActivate();
}
