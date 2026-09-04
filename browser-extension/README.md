# Claude Design Download Companion

This directory is a real Manifest V3 browser extension. Load the directory through the browser's unpacked-extension flow, or use `claude-design-download-companion.zip` for a ZIP installation path. The ZIP is not a CRX and no extension signing key is used.

## User flow

1. A link context action or the toolbar action opens the proposal surface.
2. The surface shows the source URL, proposed file name, and the selected Downloads destination. Nothing transfers before the installed desktop app validates and confirms the proposal.
3. Cancel removes the pending proposal and returns `queueChanged: false`; it sends no transfer command.
4. The extension hands the proposal to the installed Windows native host using a four-byte native-endian length-prefixed UTF-8 JSON frame. The host owns the durable queue, actual transfer, pause, resume, cancel, rate, ETA, and separate progress window.
5. The host closes the progress window after cancellation, failure, or completion, then emits a non-blocking completion notification. The browser extension never calls the browser download API and never creates a fake progress window.

## Native host

The host name is `com.claude.design.downloads`. Registration templates live under `native-host/`, with install-folder and extension-id placeholders only. The host protocol is four-byte native-endian length-prefixed JSON and is described by `native-host/protocol.schema.json`. Unknown fields, malformed JSON, embedded URL credentials, unsafe path segments, oversized payloads, private or loopback sources, and unsupported protocol versions are rejected. The extension requires the installed native host before a transfer can begin.

## Verification

Run `node --test test/contract.test.mjs` from this directory. It checks the manifest, referenced files, native handoff, cancellation semantics, input limits, and machine-neutral host templates. The TypeScript state-machine and native-host suites are under `../packages/downloads/test/` and are compiled by the parent build's TypeScript route.
