import { describe, expect, it } from "vitest";
import { runAfterReady } from "./ready-bootstrap";

describe("runAfterReady", () => {
  it("configures the session before creating a window", async () => {
    const order: string[] = [];
    await runAfterReady(async () => { order.push("ready"); }, () => { order.push("configure"); }, async () => { order.push("create"); });
    expect(order).toEqual(["ready", "configure", "create"]);
  });
});
