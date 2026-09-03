import { describe, expect, it, vi } from "vitest";
import { configureSessionSecurity } from "./session-security";

describe("configureSessionSecurity", () => {
  it("configures permission denial through the injected ready session", () => {
    const request = vi.fn();
    const check = vi.fn();
    configureSessionSecurity({ setPermissionRequestHandler: request, setPermissionCheckHandler: check });
    expect(request).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledOnce();
    const callback = vi.fn();
    request.mock.calls[0][0](null, "notifications", callback);
    expect(callback).toHaveBeenCalledWith(false);
    expect(check.mock.calls[0][0]()).toBe(false);
  });
});
