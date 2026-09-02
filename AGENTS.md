# Agent guidance mirror

This file is a sanitized public mirror of the shared contribution and safety guidance. It is informational only. Update the canonical instruction source first when global guidance changes.

## Repository discipline

- Inspect status and fetch the configured remote before implementation. Preserve unrelated local changes and never rewrite or discard history to make a change fit.
- Use isolated checkouts for parallel work. Keep each change within its declared paths and integrate only after reviewing the diff.
- Use the `git` CLI for repository operations and the `gh` CLI for forge operations. Keep public records professional and free of private data.
- Every commit identifies the real change in English and Cantonese. Keep licensing, security, documentation, roadmap, and handoff records current.

## Product boundaries

- The supported delivery target is Windows x64 until the project explicitly documents another target.
- The application is an unofficial integration surface. Do not imply endorsement, affiliation, or ownership by upstream vendors.
- Local-only data stays local unless the user explicitly starts a configured network operation. Never place credentials in source, logs, captures, exports, or public records.
- Installers are unsigned and must use Squirrel.Windows. Do not add signing keys, certificates, or alternate installer formats.
- Do not claim a feature, release, capture, or verification result until it exists in the built product and the evidence is recorded.

## Documentation and verification

- Use the product documentation index and roadmap as the source of truth for this checkout.
- Every user-facing feature needs a behaviour article, failure and security notes, localization and accessibility coverage, focused tests, and a real built-artifact interaction record before its roadmap item is marked complete.
- If a required build, account, hardware surface, or capture route is unavailable, record the exact limitation and leave the related checkbox unticked.
- Never place credentials, private paths, private vocabulary, or user-specific payloads in public mirrors, issues, releases, or documentation.
