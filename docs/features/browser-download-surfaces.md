# Browser download surfaces

## Behavior

The browser companion opens a real Start download decision before transfer, a separate Downloading progress surface during transfer, and an always-on-top completion surface afterwards.

## Configuration

The extension is provided unpacked or as ZIP. Native messaging registration belongs to the installer, and queue state is durable and cancellable.

## Failure and security

Cancel leaves the queue unchanged. Progress, rate, ETA, errors, and completion reflect the actual transfer. No signed CRX is produced under the permanent no-signing policy.

## Verification

Verify extension handoff, start confirmation, progress controls, pause/resume/cancel, completion, focus, accessibility, narrow layout, and three independent capture records. Runtime evidence is pending.

## Suggested articles

[Notifications](notification-centre.md), [Bulk actions](bulk-actions.md), [Status Hub](status-hub.md).
