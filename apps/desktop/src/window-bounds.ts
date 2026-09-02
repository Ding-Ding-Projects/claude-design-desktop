export type WorkArea = { x: number; y: number; width: number; height: number };
export type WindowBounds = { x?: number; y?: number; width?: number; height?: number };

export const DEFAULT_BOUNDS = { width: 1280, height: 800 } as const;
export const MIN_BOUNDS = { width: 960, height: 700 } as const;

/** Keep a restored window usable even when the display is smaller than the nominal minimum. */
export function clampBounds(bounds: WindowBounds, workArea: WorkArea) {
  const maxWidth = Math.max(320, Math.floor(workArea.width * 0.95));
  const maxHeight = Math.max(240, Math.floor(workArea.height * 0.95));
  const width = Math.min(Math.max(bounds.width ?? DEFAULT_BOUNDS.width, Math.min(MIN_BOUNDS.width, maxWidth)), maxWidth);
  const height = Math.min(Math.max(bounds.height ?? DEFAULT_BOUNDS.height, Math.min(MIN_BOUNDS.height, maxHeight)), maxHeight);
  const x = Math.min(Math.max(bounds.x ?? workArea.x + Math.floor((workArea.width - width) / 2), workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(bounds.y ?? workArea.y + Math.floor((workArea.height - height) / 2), workArea.y), workArea.y + workArea.height - height);
  return { x, y, width, height };
}
