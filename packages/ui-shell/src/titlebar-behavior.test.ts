import { describe, expect, it } from "vitest";
import { isTitlebarDragDoubleClickTarget } from "./titlebar-behavior";

describe("isTitlebarDragDoubleClickTarget", () => {
  it("accepts the drag surface", () => expect(isTitlebarDragDoubleClickTarget({ closest: () => null } as unknown as EventTarget)).toBe(true));
  it("excludes every no-drag child", () => expect(isTitlebarDragDoubleClickTarget({ closest: (selector: string) => selector === ".no-drag" ? {} : null } as unknown as EventTarget)).toBe(false));
});
