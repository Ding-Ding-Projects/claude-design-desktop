import { describe, expect, it } from "vitest";
import { parsePersistedState } from "./persisted-state";

describe("parsePersistedState", () => {
  it("rejects unknown fields and malformed bounds", () => {
    expect(parsePersistedState({ version: 1, maximized: false, extra: true })).toEqual({ version: 1, maximized: false });
    expect(parsePersistedState({ version: 1, maximized: false, bounds: { x: 0, y: 0, width: 0, height: 800 } })).toEqual({ version: 1, maximized: false });
  });

  it("accepts only complete, finite integer bounds", () => {
    expect(parsePersistedState({ version: 1, maximized: true, bounds: { x: 10, y: 20, width: 1280, height: 800 } })).toEqual({ version: 1, maximized: true, bounds: { x: 10, y: 20, width: 1280, height: 800 } });
  });
});
