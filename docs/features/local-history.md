# Local history

## Behavior

User-managed records, settings, projects, files, authenticator entries, imports, restores, and bulk actions are recorded in an isolated append-only local Git history. Restores create new revisions.

## Configuration

The history manager supports search, date range, action filters, diff, labels, retention, redacted export, and a password, PIN, or TOTP factor of its own.

## Failure and security

Secrets never enter plaintext history. Encrypted snapshots use stable identifiers for authenticated data. A history-write failure reports a localized notice without claiming the mutation was recorded.

## Verification

Verify commit creation, restore, wrong-factor, unavailable vault, interrupted commit, redaction, filtering, export, and restart recovery. Final artifact evidence is pending.

## Suggested articles

[Exports](exports.md), [Changelog viewer](changelog-viewer.md), [Toy locks and authentication](toy-locks-authentication.md).
