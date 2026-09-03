declare module "node:test" {
  const test: any;
  export default test;
}

declare module "node:assert/strict" {
  const assert: any;
  export default assert;
}

declare module "node:fs" { export const createWriteStream: any; }
declare module "node:fs/promises" { export const mkdir: any; export const mkdtemp: any; export const readFile: any; export const rename: any; export const rm: any; export const stat: any; export const statfs: any; export const writeFile: any; }
declare module "node:os" { export const homedir: any; export const tmpdir: any; }
declare module "node:path" { const path: any; export default path; }
declare module "node:events" { export const once: any; }
declare module "node:dns/promises" { export const lookup: any; }
declare module "node:net" { const net: any; export default net; }
declare module "node:crypto" { export const createHash: any; export const createHmac: any; export const randomBytes: any; export const timingSafeEqual: any; }
declare const process: any;
declare const Buffer: any;
type Buffer = any;
