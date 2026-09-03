import { describe, expect, it } from "vitest";
import { readPackagedProvenance } from "./provenance";

describe("readPackagedProvenance", () => {
  it("returns unavailable when packaged metadata is absent", () => {
    expect(readPackagedProvenance("missing-provenance.json", "0.1.0")).toEqual({ version: "0.1.0", updatedAt: "" });
  });
});
