import type { DesignerBridge } from "../../../../packages/contracts/src/index";

declare global {
  interface Window {
    designer: DesignerBridge;
  }
}

export {};
