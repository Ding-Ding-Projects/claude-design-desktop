# Exports

## Behavior

Every owned record and view has a faithful export route. Structured data can use JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML, SQL, and schema/source formats where the shape supports them.

## Configuration

The export surface states UTF-8, line endings, schema version, active filters, and any lossy conversion before writing. ZIP and 7z choices expose compression and encryption settings honestly.

## Failure and security

Relative archive paths prevent extraction escape. Secrets and private vocabulary are omitted from ordinary exports and named as omitted. Overwrites require the destructive confirmation gate.

## Verification

Verify filtered export, round trip, lossy disclosure, archive paths, 7z options, cancellation, atomic output, and VS Code handoff. Final built evidence is pending.

## Suggested articles

[Bulk actions](bulk-actions.md), [External editor](external-editor.md), [Destructive confirmation](destructive-confirmation.md).
