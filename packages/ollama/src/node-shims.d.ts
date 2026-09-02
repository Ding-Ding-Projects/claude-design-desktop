declare module "node:path" {
  export const basename: (path: string) => string;
  export const isAbsolute: (path: string) => boolean;
  export const normalize: (path: string) => string;
}

declare module "node:test" {
  const test: any;
  export default test;
}

declare module "node:assert/strict" {
  const assert: any;
  export default assert;
}
