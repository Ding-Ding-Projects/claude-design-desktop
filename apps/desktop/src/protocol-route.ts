export const PROTOCOL_SCHEME = "claude-design-desktop";

import type { ProtocolRoute } from "../../../packages/contracts/src/index";
export type { ProtocolRoute } from "../../../packages/contracts/src/index";

export function parseProtocolRoute(rawUrl: string): ProtocolRoute | null {
  try {
    if (/(?:^|\/)\.\.(?:\/|$)/.test(rawUrl)) return null;
    const url = new URL(rawUrl);
    if (url.protocol !== `${PROTOCOL_SCHEME}:` || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.host === "home" && parts.length === 0) return { type: "home" };
    if (url.host === "project" && parts.length === 1 && /^[a-zA-Z0-9_-]{1,128}$/.test(parts[0])) return { type: "open-project", projectId: parts[0] };
    return null;
  } catch { return null; }
}
