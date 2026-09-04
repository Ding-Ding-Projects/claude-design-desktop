import { createRoot } from "react-dom/client";
import type { DesignerBridge } from "./bridge";
import { WorkspaceApp } from "./WorkspaceApp";

export function mountWorkspace(container: Element, bridge: DesignerBridge): { unmount(): void } {
  const root = createRoot(container);
  root.render(<WorkspaceApp bridge={bridge} />);
  return { unmount: () => root.unmount() };
}
