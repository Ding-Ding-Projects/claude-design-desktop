# Download state machine

This package owns the bounded download protocol used by the desktop bridge and the browser companion.

## Start and transfer lifecycle

`DownloadStateMachine.prepareStart()` validates a source URL, one file name, and a bounded destination, then creates a proposal in `awaiting-confirmation`. The queue is unchanged until `confirmStart()` is called. `cancelProposal()` removes only that proposal and reports no queue mutation. Confirmation creates a queued item and a separate `ProgressWindowModel` whose `alwaysOnTop` value is always true. `startNext()` begins the transfer through the injected transfer starter. Progress updates calculate bytes per second and ETA, while pause, resume, cancel, failure, and completion are explicit transitions.

The state machine does not perform network I/O itself. The browser adapter calls the real browser download API, while the native host adapter owns the separate always-on-top desktop progress window. This keeps the state transitions deterministic and makes the actual transfer seam testable.

## Bounds and safety

URLs are limited to 2,048 characters and HTTP or HTTPS without embedded credentials. File names are limited to 240 characters and cannot contain path separators, control characters, `.` or `..`, trailing spaces, or trailing periods. Destination values are limited to 1,024 characters and reject parent traversal. The queue holds at most 256 proposals or queued items, and byte counters are capped at 5,000,000,000 bytes. Native JSON messages are capped at 64 KiB and reject unknown fields or protocol versions.

## Verification

The focused TypeScript tests cover proposal confirmation, queue preservation on cancellation, progress rate and ETA, pause/resume/cancel, terminal outcomes, input limits, exact native envelopes, host manifest placeholders, and protocol byte bounds. The browser contract tests verify the MV3 manifest, real browser download call, separate progress window, bounded inputs, and strict native schema. The extension is distributed as an unpacked directory or ZIP. No CRX is produced.
