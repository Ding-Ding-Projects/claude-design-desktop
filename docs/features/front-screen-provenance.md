# Front-screen provenance

## Behavior

Every app and page shows its running version and that version's updated-at value on the initial surface, with timezone. Values come from artifact-bound provenance, not launch time or an agent clock.

## Configuration

`site/version.json` carries a versioned schema, source commit, timezone, and provenance state. Missing or invalid updated-at data renders as unavailable.

## Failure and security

The UI never invents a timestamp. A preview without release provenance says it is pending and keeps download controls unavailable. Provenance metadata contains no credentials.

## Verification

Verify valid and missing provenance, timezone labels, localization, unclipped display at narrow and high-scale layouts, and the negative case that removes each boundary. `site/version.json` is bound to the published release recorded in `site/release-manifest.json`; `scripts/build-site-release-manifest.mjs --check` fails when the two drift from the release record.

## Suggested articles

[Status Hub](status-hub.md), [Changelog viewer](changelog-viewer.md), [Shared-link embed](shared-link-embed.md).
