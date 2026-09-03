import type { ExternalEditorDescriptor } from "./types";

export interface EditorDiscoveryInput {
  pathExecutables?: Record<string, string | null | undefined>;
  knownLocations?: Array<{ id: string; displayName: string; executablePath: string }>;
  registered?: ExternalEditorDescriptor[];
}

/** Returns descriptors only. It never runs an editor during discovery. */
export function discoverExternalEditors(input: EditorDiscoveryInput): ExternalEditorDescriptor[] {
  const result = new Map<string, ExternalEditorDescriptor>();
  for (const [id, executablePath] of Object.entries(input.pathExecutables ?? {})) {
    if (!executablePath) continue;
    result.set(id, { id, displayName: id, executablePath, source: "path", supportsFiles: true, supportsFolders: true });
  }
  for (const location of input.knownLocations ?? []) {
    if (!location.executablePath || result.has(location.id)) continue;
    result.set(location.id, { ...location, source: "known-location", supportsFiles: true, supportsFolders: true });
  }
  for (const editor of input.registered ?? []) {
    if (editor.executablePath) result.set(editor.id, { ...editor, source: "user-registered" });
  }
  return [...result.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function editorLaunchArgs(editor: ExternalEditorDescriptor, targetPath: string): string[] {
  if (!targetPath.trim()) throw new Error("target-path-required");
  if (!editor.supportsFiles && !editor.supportsFolders) throw new Error("editor-has-no-supported-target");
  return [targetPath];
}


