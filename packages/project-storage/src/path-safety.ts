import { lstat } from "node:fs/promises";
import path from "node:path";
export class UnsafeProjectPathError extends Error { readonly code = "UNSAFE_PROJECT_PATH"; }
export async function safeProjectPath(root: string, relativePath: string): Promise<string> {
  if (typeof relativePath !== "string" || !relativePath.trim()) throw new UnsafeProjectPathError("A project path is required.");
  if (path.isAbsolute(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath) || /^\\\\/.test(relativePath)) throw new UnsafeProjectPathError("Absolute and device paths are not allowed.");
  const parts = relativePath.replaceAll("\\", "/").split("/");
  const reserved = /^(con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes("\0") || part.includes(":") || /[. ]$/.test(part) || reserved.test(part))) throw new UnsafeProjectPathError("Traversal, ADS, reserved device names, trailing dots or spaces, and NUL bytes are not allowed.");
  const rootAbsolute = path.resolve(root); const candidate = path.resolve(rootAbsolute, ...parts); const prefix = rootAbsolute.endsWith(path.sep) ? rootAbsolute : `${rootAbsolute}${path.sep}`;
  if (candidate !== rootAbsolute && !candidate.startsWith(prefix)) throw new UnsafeProjectPathError("The path escapes the project workspace.");
  let current = rootAbsolute;
  for (const part of parts) { current = path.join(current, part); try { if ((await lstat(current)).isSymbolicLink()) throw new UnsafeProjectPathError("Symlinks and reparse points are not allowed."); } catch (error) { if (error instanceof UnsafeProjectPathError) throw error; if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; break; } }
  return candidate;
}
export function assertSafeProjectIdentifier(value: string, label: string): string { if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) throw new UnsafeProjectPathError(`${label} contains unsupported characters.`); return value; }
