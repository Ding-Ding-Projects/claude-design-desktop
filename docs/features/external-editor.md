# External editor

## Behavior

The product detects installed editors and opens a project folder or file. Visual Studio Code is the required export destination, and folders open as workspace roots.

## Configuration

The selected editor is persisted. Detection covers PATH, per-user and machine installations, Insiders, and portable builds.

## Failure and security

No editor integration is required for core app operation. If no supported editor is found, the surface explains the condition and keeps the exported file available.

## Verification

Verify detected editor enumeration, workspace-root launch, file launch, missing-editor message, export handoff, keyboard access, and local-only behavior. Built evidence is pending.

## Suggested articles

[Exports](exports.md), [File converter](file-converter.md), [Local history](local-history.md).
