export type LanguageMode = "en" | "yue" | "bilingual";
export type AccountState = "signedOut" | "signingIn" | "ready" | "refreshing" | "offline" | "unavailable" | "error";
export type ProjectRole = "owner" | "editor" | "commenter" | "viewer";
export type FeatureId = "language-modes" | "dialog-emoji-toggle" | "school-mode" | "narration" | "scheduled-settings" | "dim-sum-surprise" | "regex-builders" | "notification-centre" | "appearance-editors" | "tabbed-navigation" | "offline-documentation" | "command-palette" | "destructive-confirmation" | "local-history" | "changelog-viewer" | "external-editor" | "exports" | "bulk-actions" | "accessibility-responsive-sizing" | "personal-vocabulary-upload" | "toy-locks-authentication" | "unlock-ladder" | "shared-link-embed" | "adhd-modes" | "browser-download-surfaces" | "app-logo-customization" | "file-converter" | "ollama-suite-manager" | "status-hub" | "front-screen-provenance";
export interface FeatureInventoryEntry { id: FeatureId; surface: "desktop" | "site"; status: "pending" | "verified"; implementation: string; route: string; documentation: string; localization: string; persistence: string; focusedTest: string; interactionEvidence: string; captureEvidence: string; boundary: string; availability: string; negativeCase: string; }
export interface Provenance { version: string; updatedAt: string; timezone: string; source: "build" | "release" | "unavailable"; }
export interface Notification { id: string; kind: "info" | "success" | "progress" | "warning" | "error"; title: string; body: string; createdAt: string; dismissedAt?: string; action?: { label: string; command: string }; }
export interface SearchState { query: string; regex: boolean; pattern: string; flags: string; error?: string; }
export interface Tab { id: string; title: string; groupId?: string; pinned: boolean; locked: boolean; closable: boolean; }
export interface TabGroup { id: string; name: string; color: string; collapsed: boolean; pinned: boolean; }
export interface AppearanceValue { kind: "color" | "rainbow" | "font" | "number" | "text"; value: string | number; }
export interface LockDefinition { id: string; targetId: string; policy: "pin" | "password" | "pin+password" | "password+totp" | "pin+totp" | "password+pin+totp"; unlockMinutes?: number; lockedOnLaunch: boolean; }
export interface TotpEntry { id: string; issuer: string; account: string; algorithm: "SHA-1" | "SHA-256" | "SHA-512"; digits: 6 | 7 | 8; period: number; }
