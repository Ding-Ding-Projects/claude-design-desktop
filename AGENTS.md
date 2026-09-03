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
- The shipping application is a local design workspace and never contacts the hosted shell or the legacy router. Historical compatibility code must not be treated as shipping behaviour and must be absent from the shipping tip.
- Local-only data stays local. A network operation needs an explicit product contract, destination allowlist, bounded time and payload limits, and user-visible evidence. Never place credentials in source, logs, captures, exports, or public records.
- Installers are unsigned and must use Squirrel.Windows. Do not add signing keys, certificates, or alternate installer formats.
- Do not claim a feature, release, capture, or verification result until it exists in the built product and the evidence is recorded.

## Stable identity

The stable identity contract is package `@ding-ding-projects/claude-design-desktop`, app ID `com.dingdingprojects.claudedesigndesktop`, executable `Claude Design Desktop.exe`, protocol `claude-design-desktop://`, and local data root `%LOCALAPPDATA%\Ding-Ding-Projects\ClaudeDesignDesktop`. The public URL is `https://ding-ding-projects.github.io/claude-design-desktop/`. A display-label preference is presentation-only and must not alter any identity field.

## Documentation and verification

- Use the product documentation index and roadmap as the source of truth for this checkout.
- Every user-facing feature needs a behaviour article, failure and security notes, localization and accessibility coverage, focused tests, and a real built-artifact interaction record before its roadmap item is marked complete.
- If a required build, account, hardware surface, or capture route is unavailable, record the exact limitation and leave the related checkbox unticked.
- Never place credentials, private paths, private vocabulary, or user-specific payloads in public mirrors, issues, releases, or documentation.

## Toolchain and release

- Root build scripts must bootstrap the declared toolchain in a user-scoped, reproducible, idempotent way and support silent execution for automation.
- Local checks still run when they apply, but a release record must name exactly what ran. Automated publication must not claim checks that did not run.
- Every supported Windows installer uses Squirrel.Windows and remains unsigned. The release must include exact version, commit, package hashes, provenance, and the operating-system warning.
- Third-party notices must match the packaged contents. The `@openai/codex` notice remains conditional until the runtime is genuinely packaged.

## User-facing quality

- User-facing surfaces need accessible names and states, visible focus, keyboard operation, localization, responsive layouts, non-blocking notifications, and truthful empty and failure states.
- Settings, searches, menus, exports, history, and documentation are real functionality, not decorative placeholders. Each new surface records its implementation, documentation, focused checks, and built-product evidence.
- Do not ship private payloads, credentials, user paths, or unverified screenshots. A missing capture is recorded as pending.
