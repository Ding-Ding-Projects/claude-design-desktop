# Security and privacy

## Local-only sharing truth

Project files, local metadata, and sharing drafts are local data by default. A request or sharing action may send data only when the user explicitly starts the configured operation. A preview, status row, or documentation link must not imply that data was sent when it was not.

## Credential handling

Credentials belong in the platform credential store or another protected runtime boundary. They must never appear in source control, logs, screenshots, exports, crash reports, public issues, documentation, or diagnostic responses. Error messages should identify the failed operation and recovery route without echoing credential material or private payloads.

## Network boundaries

Network calls must use explicit destinations, bounded timeouts, response-size limits, and schema validation. Reject embedded URL credentials, unsafe redirects, unbounded retries, and responses that do not match the expected contract. A local development route must be clearly distinguished from a supported production endpoint.

## Distribution boundary

The supported delivery target is Windows x64 for this phase. The installer will be unsigned and may trigger an unknown-publisher or SmartScreen warning. No code-signing key or certificate is required or permitted for this project.

## Reporting

Do not disclose sensitive details in a public issue. Use the private security channel when available, or open a minimal issue that contains only a safe summary and the affected commit. See [`SECURITY.md`](../../SECURITY.md) for the full reporting policy.

## Current verification

This article records the intended security model. The packaged runtime, installer, and end-to-end privacy evidence are not verified in the current extraction baseline.

## Suggested articles

- [Product overview](overview.md)
- [Licensing and attribution](licensing.md)
- [Build and contribution](build-and-contribute.md)
