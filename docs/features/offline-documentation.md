# Offline documentation

## Behavior

Feature articles are bundled at build time and rendered by one isolated markdown renderer. Links between articles resolve inside the documentation browser, and the browser has its own search and regex builder.

## Configuration

The bundle inventory is generated from `docs/features`. A build-time completeness check compares article IDs and titles with the hand-written canonical list.

## Failure and security

Missing or malformed articles fail the bundle check. Provider-authored markup is rendered without application privileges, and relative links use a known base.

## Verification

Verify offline startup, article count parity, headings, links, code blocks, empty states, search, keyboard operation, and screen-reader structure. The integrated bundle check is pending.

## Suggested articles

[Regex builders](regex-builders.md), [Changelog viewer](changelog-viewer.md), [Status Hub](status-hub.md).
