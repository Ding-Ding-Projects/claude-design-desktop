export function isTitlebarDragDoubleClickTarget(target: EventTarget | null) {
  if (typeof target !== "object" || target === null) return false;
  const candidate = target as { closest?: (selector: string) => unknown };
  return typeof candidate.closest === "function" && !candidate.closest(".no-drag");
}
