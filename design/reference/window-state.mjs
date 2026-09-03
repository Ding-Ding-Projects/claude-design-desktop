export function clampWindowBounds(bounds, workArea) {
  const maxWidth = Math.max(320, Math.floor(workArea.width * 0.95));
  const maxHeight = Math.max(240, Math.floor(workArea.height * 0.95));
  const width = Math.min(maxWidth, Math.max(320, Math.floor(Number(bounds.width) || 320)));
  const height = Math.min(maxHeight, Math.max(240, Math.floor(Number(bounds.height) || 240)));
  const x = Math.min(workArea.x + workArea.width - width, Math.max(workArea.x, Math.floor(Number(bounds.x) || workArea.x)));
  const y = Math.min(workArea.y + workArea.height - height, Math.max(workArea.y, Math.floor(Number(bounds.y) || workArea.y)));
  return { x, y, width, height };
}

export function validPersistedState(value) {
  return Boolean(value && value.normal && Number.isFinite(value.normal.x) && Number.isFinite(value.normal.y) && Number.isFinite(value.normal.width) && Number.isFinite(value.normal.height) && typeof value.maximized === "boolean");
}
