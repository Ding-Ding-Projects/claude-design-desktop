# Claude Design Download Companion

This directory is a real Manifest V3 browser extension. Load the directory through the browser's unpacked-extension flow, or use `claude-design-download-companion.zip` for a ZIP installation path. The ZIP is not a CRX and no extension signing key is used.

## User flow

1. A link context action or the toolbar action opens the Start download surface.
2. The surface shows the source URL, proposed file name, and the browser Downloads destination. Nothing transfers before the user activates Start download.
3. Cancel removes the pending proposal and returns `queueChanged: false`; it does not call the browser download API.
4. Start calls `chrome.downloads.download()` and opens a distinct progress window. The progress surface reports bytes, total size where supplied, rate, ETA, pause, resume, cancel, interrupted, and completed states.
5. Completion is a non-blocking browser notification. If the native host is installed, the same bounded event also opens or updates its always-on-top desktop progress model.

## Native host

The host name is `com.claude.design.downloads`. Registration templates live under `native-host/`, with install-folder and extension-id placeholders only. The host protocol is newline-delimited JSON and is described by `native-host/protocol.schema.json`. Unknown fields, malformed JSON, embedded URL credentials, unsafe path segments, oversized payloads, and unsupported protocol versions are rejected. The browser-only extension remains usable when the native host is unavailable.

## Verification

Run `node --test test/contract.test.mjs` from this directory. It checks the manifest, referenced files, actual download and progress-window calls, cancellation semantics, input limits, and machine-neutral host templates. The TypeScript state-machine suite is under `../packages/downloads/test/` and is compiled by the parent build's TypeScript route.
