declare module "react" {
  export type ReactNode = unknown;
  export type ReactElement = unknown;
  export function createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): ReactElement;
}
