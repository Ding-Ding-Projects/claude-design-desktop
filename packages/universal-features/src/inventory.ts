import type { FeatureId, FeatureInventoryEntry } from "./types.js";

export const CANONICAL_FEATURE_IDS: readonly FeatureId[] = [
  "language-modes",
  "dialog-emoji-toggle",
  "school-mode",
  "narration",
  "scheduled-settings",
  "dim-sum-surprise",
  "regex-builders",
  "notification-centre",
  "appearance-editors",
  "tabbed-navigation",
  "offline-documentation",
  "command-palette",
  "destructive-confirmation",
  "local-history",
  "changelog-viewer",
  "external-editor",
  "exports",
  "bulk-actions",
  "accessibility-responsive-sizing",
  "personal-vocabulary-upload",
  "toy-locks-authentication",
  "unlock-ladder",
  "shared-link-embed",
  "adhd-modes",
  "browser-download-surfaces",
  "app-logo-customization",
  "file-converter",
  "ollama-suite-manager",
  "status-hub",
  "front-screen-provenance"
];

const fields = ["implementation", "route", "documentation", "localization", "persistence", "focusedTest", "interactionEvidence", "captureEvidence", "boundary", "availability", "negativeCase"] as const;
function explicitRow(id: FeatureId, surface: FeatureInventoryEntry["surface"], implementation: string): FeatureInventoryEntry {
  return { id, surface, status: "pending", implementation, route: "pending: host route", documentation: "docs/README.md", localization: "src/localization.ts", persistence: "pending: host persistence", focusedTest: "test/universal-features.test.mjs", interactionEvidence: "pending", captureEvidence: "pending", boundary: "No credentials, private vocabulary, or raw host handles cross the renderer boundary", availability: "Pending exact host implementation and built evidence", negativeCase: "pending: remove registration" };
}

// Every row is written explicitly so a missing feature cannot disappear from discovery.
export const FEATURE_INVENTORY: readonly FeatureInventoryEntry[] = [
  explicitRow("language-modes", "desktop", "src/localization.ts"),
  explicitRow("language-modes", "site", "src/localization.ts"),
  explicitRow("dialog-emoji-toggle", "desktop", "src/localization.ts"),
  explicitRow("dialog-emoji-toggle", "site", "src/localization.ts"),
  explicitRow("school-mode", "desktop", "src/school-mode.ts"),
  explicitRow("school-mode", "site", "src/school-mode.ts"),
  explicitRow("narration", "desktop", "src/localization.ts"),
  explicitRow("narration", "site", "src/localization.ts"),
  explicitRow("scheduled-settings", "desktop", "src/settings.ts"),
  explicitRow("scheduled-settings", "site", "src/settings.ts"),
  explicitRow("dim-sum-surprise", "desktop", "src/platform.ts"),
  explicitRow("dim-sum-surprise", "site", "src/platform.ts"),
  explicitRow("regex-builders", "desktop", "src/tabs.ts"),
  explicitRow("regex-builders", "site", "src/tabs.ts"),
  explicitRow("notification-centre", "desktop", "src/notifications.ts"),
  explicitRow("notification-centre", "site", "src/notifications.ts"),
  explicitRow("appearance-editors", "desktop", "src/appearance.ts"),
  explicitRow("appearance-editors", "site", "src/appearance.ts"),
  explicitRow("tabbed-navigation", "desktop", "src/tabs.ts"),
  explicitRow("tabbed-navigation", "site", "src/tabs.ts"),
  explicitRow("offline-documentation", "desktop", "docs/README.md"),
  explicitRow("offline-documentation", "site", "docs/README.md"),
  explicitRow("command-palette", "desktop", "src/command-palette.ts"),
  explicitRow("command-palette", "site", "src/command-palette.ts"),
  explicitRow("destructive-confirmation", "desktop", "src/types.ts"),
  explicitRow("destructive-confirmation", "site", "src/types.ts"),
  explicitRow("local-history", "desktop", "src/notifications.ts"),
  explicitRow("local-history", "site", "src/notifications.ts"),
  explicitRow("changelog-viewer", "desktop", "docs/README.md"),
  explicitRow("changelog-viewer", "site", "docs/README.md"),
  explicitRow("external-editor", "desktop", "src/types.ts"),
  explicitRow("external-editor", "site", "src/types.ts"),
  explicitRow("exports", "desktop", "src/settings.ts"),
  explicitRow("exports", "site", "src/settings.ts"),
  explicitRow("bulk-actions", "desktop", "src/settings.ts"),
  explicitRow("bulk-actions", "site", "src/settings.ts"),
  explicitRow("accessibility-responsive-sizing", "desktop", "src/types.ts"),
  explicitRow("accessibility-responsive-sizing", "site", "src/types.ts"),
  explicitRow("personal-vocabulary-upload", "desktop", "src/personal-vocabulary.ts"),
  explicitRow("personal-vocabulary-upload", "site", "src/personal-vocabulary.ts"),
  explicitRow("toy-locks-authentication", "desktop", "src/locks-auth.ts"),
  explicitRow("toy-locks-authentication", "site", "src/locks-auth.ts"),
  explicitRow("unlock-ladder", "desktop", "src/locks-auth.ts"),
  explicitRow("unlock-ladder", "site", "src/locks-auth.ts"),
  explicitRow("shared-link-embed", "desktop", "docs/README.md"),
  explicitRow("shared-link-embed", "site", "docs/README.md"),
  explicitRow("adhd-modes", "desktop", "src/settings.ts"),
  explicitRow("adhd-modes", "site", "src/settings.ts"),
  explicitRow("browser-download-surfaces", "desktop", "src/platform.ts"),
  explicitRow("browser-download-surfaces", "site", "src/platform.ts"),
  explicitRow("app-logo-customization", "desktop", "src/platform.ts"),
  explicitRow("app-logo-customization", "site", "src/platform.ts"),
  explicitRow("file-converter", "desktop", "src/converter-ollama.ts"),
  explicitRow("file-converter", "site", "src/converter-ollama.ts"),
  explicitRow("ollama-suite-manager", "desktop", "src/converter-ollama.ts"),
  explicitRow("ollama-suite-manager", "site", "src/converter-ollama.ts"),
  explicitRow("status-hub", "desktop", "src/platform.ts"),
  explicitRow("status-hub", "site", "src/platform.ts"),
  explicitRow("front-screen-provenance", "desktop", "src/platform.ts"),
  explicitRow("front-screen-provenance", "site", "src/platform.ts"),
];

export interface InventoryValidationOptions { pathExists?: (path: string) => boolean; }
export function assertCompleteInventory(entries: readonly FeatureInventoryEntry[], expected: readonly FeatureId[] = CANONICAL_FEATURE_IDS, options: InventoryValidationOptions = {}): void {
  if (entries.length !== expected.length * 2) throw new Error(`Expected ${expected.length * 2} explicit surface rows`);
  for (const id of expected) for (const surface of ["desktop", "site"] as const) {
    const matches = entries.filter(entry => entry.id === id && entry.surface === surface);
    if (matches.length !== 1) throw new Error(`Missing or duplicate ${surface} row for ${id}`);
    const entry = matches[0];
    if (!entry) throw new Error(`Missing ${surface} row for ${id}`);
    for (const field of fields) if (!entry[field].trim()) throw new Error(`Empty ${field} for ${surface} ${id}`);
    if (options.pathExists && !options.pathExists(entry.implementation)) throw new Error(`Missing implementation path for ${surface} ${id}`);
    if (entry.status !== "pending" && entry.status !== "verified") throw new Error(`Invalid status for ${surface} ${id}`);
    if (entry.status === "verified" && (entry.route.startsWith("pending:") || entry.persistence.startsWith("pending:") || entry.interactionEvidence === "pending" || entry.captureEvidence === "pending")) throw new Error(`Unproven verified state for ${surface} ${id}`);
  }
}

export function negativeRegression(entries: readonly FeatureInventoryEntry[], removeId: FeatureId, surface: FeatureInventoryEntry["surface"]): boolean { try { assertCompleteInventory(entries.filter(entry => !(entry.id === removeId && entry.surface === surface))); return false; } catch { return true; } }
