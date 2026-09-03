import { describe, expect, it } from "vitest";
import { parseProtocolRoute } from "./protocol-route";

describe("parseProtocolRoute", () => {
  it("accepts the exact home route", () => expect(parseProtocolRoute("claude-design-desktop://home")).toEqual({ type: "home" }));
  it("accepts a bounded project id", () => expect(parseProtocolRoute("claude-design-desktop://project/project_123")).toEqual({ type: "open-project", projectId: "project_123" }));
  it("rejects credentials, queries, fragments, and traversal", () => {
    expect(parseProtocolRoute("claude-design-desktop://project/a?token=secret")).toBeNull();
    expect(parseProtocolRoute("claude-design-desktop://project/../a")).toBeNull();
  });
});
