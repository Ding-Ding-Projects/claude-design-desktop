import { describe, expect, it } from "vitest";
import { clampBounds } from "./window-bounds";

describe("clampBounds", () => {
  it("uses the standard size on a normal display", () => {
    expect(clampBounds({}, { x: 0, y: 0, width: 1920, height: 1080 })).toEqual({ x: 320, y: 140, width: 1280, height: 800 });
  });

  it("keeps a restored window inside a small work area", () => {
    const result = clampBounds({ x: -500, y: -500, width: 1800, height: 1400 }, { x: 0, y: 0, width: 1366, height: 768 });
    expect(result.width).toBe(1297);
    expect(result.height).toBe(729);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("preserves a valid position while clamping oversized dimensions", () => {
    expect(clampBounds({ x: 50, y: 20, width: 1000, height: 700 }, { x: 0, y: 0, width: 1200, height: 900 })).toEqual({ x: 50, y: 20, width: 1000, height: 700 });
  });
});
