# Roadmap

This checklist describes the standalone product extraction. A checked item is implemented and supported by evidence in this checkout. Unchecked items remain open.

## Product records

- [x] Preserve the source MIT license in [`LICENSE`](LICENSE).
- [x] Record third-party licensing, including the Apache-2.0 notice for the bundled `@openai/codex` runtime, in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- [x] Publish the unofficial and non-affiliation disclaimer in the README, security policy, and product overview.
- [x] Record the source extraction baseline and filtered-history method in [`provenance/extraction.md`](provenance/extraction.md).
- [x] Add product, licensing, security, build, contribution, roadmap, and handoff records.
- [x] Add a sanitized public guidance mirror in [`AGENTS.md`](AGENTS.md).

## Desktop product

- [ ] Complete the standalone Windows x64 desktop shell and custom title bar.
- [ ] Add managed multi-account Codex app-server authentication.
- [ ] Add projects, files, conversations, sharing, previews, exports, REST, Connect, JSON, and MCP parity.
- [ ] Add read-only legacy migration and the one-release router handoff.
- [ ] Add the complete user-facing feature inventory, documentation links, localization, and accessibility evidence.
- [ ] Add the bundled `@openai/codex` runtime with versioned provenance and matching notices.

## Build, release, and evidence

- [ ] Add the root package manifest and one-click dependency bootstrap.
- [ ] Add `build.bat` and `build-installer.bat` with reproducible Windows x64 Squirrel.Windows packaging.
- [ ] Verify unsigned installer output, hashes, release metadata, and the required third-party notices.
- [ ] Add the real built-artifact capture harness and screen recording route.
- [ ] Capture the front screen, settings, error and empty states, narrow layout, light theme, and dark theme from the built artifact.
- [ ] Publish a unique non-draft release with a verified installer and release provenance.
- [ ] Publish the documentation site and verify its served metadata and download links.

## Next safe actions

- [ ] Reconcile the product shell and package manifest lanes before claiming a runnable build.
- [ ] Run the focused Electron tests after the workspace toolchain is available.
- [ ] Validate the packaged runtime and capture real evidence before ticking any user-facing feature.
