# Workspace UI

This package provides the typed React workspace surface for the desktop design application. It is deliberately host-driven: `DesignerBridge` is the only boundary for accounts, projects, files, streamed chat, comments, sharing, and settings.

## Integration

Render `WorkspaceApp` with the desktop host's authenticated `DesignerBridge` implementation. The controller keeps server operations authoritative, requires a ready active account before project access, and exposes role capabilities so controls are disabled with an honest explanation when the account cannot perform an action.

The package does not duplicate the desktop title bar. It owns the account and project workspace content, editor, read-only preview, chat, comments, sharing, settings, utilities, offline documentation, history, notification, download, and status destinations.

## Verification

`src/controller.test.ts` uses a typed fake bridge to verify account identity handling, ready-account routing, role restrictions, file reads and writes, cancellation of streamed chat, comment and reply operations, device-code state, and sign-out. A host test should also exercise the built application against its real bridge.
