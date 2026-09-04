import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
const TRANSIENT = new Set(["EPERM", "EACCES", "EBUSY"]);
export async function writeFileAtomic(destination: string, data: string | Uint8Array, options: { mode?: number; renameAttempts?: number; retryDelayMs?: number } = {}): Promise<void> {
  const attempts = Math.max(1, Math.min(options.renameAttempts ?? 8, 20)); const delay = Math.max(1, Math.min(options.retryDelayMs ?? 35, 250));
  await mkdir(path.dirname(destination), { recursive: true }); const temp = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.${Date.now()}.${randomBytes(8).toString("hex")}.tmp`); let present = false;
  try { await writeFile(temp, data, { flag: "wx", mode: options.mode ?? 0o600 }); present = true; if (options.mode !== undefined) await chmod(temp, options.mode); for (let attempt = 1; attempt <= attempts; attempt += 1) { try { await rename(temp, destination); present = false; return; } catch (error) { const code = (error as NodeJS.ErrnoException).code || ""; if (!TRANSIENT.has(code) || attempt === attempts) throw error; await new Promise((resolve) => setTimeout(resolve, delay)); } } } finally { if (present) await unlink(temp).catch(() => undefined); }
}
