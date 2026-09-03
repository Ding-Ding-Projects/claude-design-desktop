# Claude Design Desktop

> **Status: extraction in progress.** This checkout contains product records and historical extraction material for a Windows x64 desktop product. It is not a published installer or a release-ready application.

Claude Design Desktop is an unofficial local design workspace with a product-owned desktop shell. The shipping product must not contact the hosted shell at `https://claude-design.ccrdesk.top/design` or the legacy `claude-code-router` project. Those integrations are historical extraction material only and must be absent from the shipping tip. The product is not affiliated with Anthropic, OpenAI, or any provider represented in historical source material.

## At a glance

- License: [MIT](LICENSE)
- Platform scope: Windows x64 only for this delivery phase
- Product records: [`docs/product/README.md`](docs/product/README.md)
- Extraction record: [`provenance/extraction.md`](provenance/extraction.md)
- Current plan: [`ROADMAP.md`](ROADMAP.md)
- Current handoff: [`HANDOFF.md`](HANDOFF.md)
- Public URL: [ding-ding-projects.github.io/claude-design-desktop](https://ding-ding-projects.github.io/claude-design-desktop/)

## Stable product identity

| Field | Stable value |
| --- | --- |
| Package | `@ding-ding-projects/claude-design-desktop` |
| App ID | `com.dingdingprojects.claudedesigndesktop` |
| Executable | `Claude Design Desktop.exe` |
| Protocol | `claude-design-desktop://` |
| Local data root | `%LOCALAPPDATA%\Ding-Ding-Projects\ClaudeDesignDesktop` |
| Public URL | `https://ding-ding-projects.github.io/claude-design-desktop/` |

The display label is separate from these identity fields. A future user-selected label may change visible product copy only. It must never change the package, app ID, executable, protocol, data root, or public URL.

## Contents

1. [What is here](#what-is-here)
2. [What is not shipped](#what-is-not-shipped)
3. [Privacy and security](#privacy-and-security)
4. [Build and contribution](#build-and-contribution)
5. [Documentation](#documentation)
6. [License and notices](#license-and-notices)

## What is here

The current source includes historical Electron integration material that discovers a legacy plugin, selects a hosted or local frontend route, and mediates matching requests. Focused unit tests cover that historical extraction. This source evidence is not shipping-product behaviour. The shipping product is local-first and must never contact the hosted shell or router. These statements describe source coverage in this checkout, not a packaged release.

## What is not shipped

The following are intentionally not claimed as complete:

- A packaged installer or signed executable
- A verified Squirrel.Windows release
- A complete application shell with every planned user-facing surface
- A published documentation or landing site
- Real built-artifact screenshots or a screen recording
- The bundled `@openai/codex` runtime and its release-specific version record
- The 16,728-line historical extraction module `packages/electron/bundled-plugins/claude-design/index.cjs`; it must be absent from the shipping tip

The root package manifest, one-click build scripts, installer script, and capture harness are also absent from this extraction baseline. The roadmap keeps those items open until their implementation and evidence land.

## Privacy and security

The product is designed around local-only project and sharing state. The shipping product never contacts the hosted shell or router. Credentials, private paths, and raw private payloads must not enter logs, captures, exports, documentation, or public issue reports. See [`SECURITY.md`](SECURITY.md) for the reporting route and the full security model.

## Build and contribution

The supported build route will be `build.bat /s`, followed by `build-installer.bat /s` for an installer, once the root scripts and package manifest land. They are not available in this baseline, so no local build or installer result is claimed. Contribution boundaries and the planned verification route are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentation

The product documentation is grouped under [`docs/product/`](docs/product/). Each article states its current verification boundary and ends with suggested next articles. The site-facing `docs/src` content is owned by another lane and is deliberately unchanged here.

## Sanitized guidance

[`AGENTS.md`](AGENTS.md) is a sanitized public mirror of the shared contribution and safety guidance. It contains no private host details, credentials, or private conversation vocabulary.

<details>
<summary>License and notices</summary>

The product source preserves the MIT notice from the extraction source. The bundled `@openai/codex` runtime, when it is added to the package, carries its Apache-2.0 notice separately in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

</details>

<details>
<summary>Captures and recording</summary>

No genuine built-artifact capture or screen recording exists in this baseline. Adding a mock, design preview, or placeholder image would misrepresent the current state. The capture and recording work remains unticked in [`ROADMAP.md`](ROADMAP.md).

</details>

<details>
<summary>Sanitized shared guidance mirror</summary>

This section mirrors the public-safe contribution and safety rules in [`AGENTS.md`](AGENTS.md). The canonical instruction source is maintained separately; this copy is for people working from the repository alone.

### Repository and change discipline

- Inspect status and fetch the configured remote before implementation. Preserve unrelated local changes and never rewrite or discard history to make a change fit.
- Use isolated checkouts for parallel work, keep each change within its declared paths, review the diff, and integrate only after the relevant checks are complete.
- Use the `git` CLI for repository operations and the `gh` CLI for forge operations. Keep public records professional and free of private data.
- Every change that affects a user-facing surface updates its documentation, roadmap state, handoff, localization, accessibility notes, focused checks, and built-product evidence.

### Product and privacy boundaries

- The supported delivery target is Windows x64 until the project explicitly documents another target.
- The product is unofficial and must not imply endorsement, affiliation, or ownership by upstream vendors.
- The shipping application is a local design workspace. It never contacts the hosted shell or the legacy router. Historical compatibility material is not shipping behaviour and must be removed before release.
- Local project and sharing data stays local unless an explicit product contract authorizes a bounded operation. Credentials, private paths, user payloads, and private source data never enter source control, logs, captures, exports, issues, releases, or documentation.
- The stable package, app ID, executable, protocol, local data root, and public URL are fixed identity fields. A display-label preference changes presentation only.

### Build and release

- Root build scripts must bootstrap their declared toolchain in a user-scoped, reproducible, idempotent way and support silent automation.
- Local checks still run when they apply, but every record names exactly what ran and never claims a check that did not run.
- Every supported Windows installer uses Squirrel.Windows and remains unsigned. Release records include exact version, commit, package hashes, provenance, and the operating-system warning.
- Third-party notices match the packaged contents. The `@openai/codex` notice is conditional until that runtime is genuinely packaged.

### User-facing quality

- User-facing surfaces provide accessible names and states, visible focus, keyboard operation, localization, responsive layouts, non-blocking notifications, and truthful empty and failure states.
- Settings, searches, menus, exports, history, and documentation are functional surfaces, not decorative placeholders. Each surface records its implementation, focused checks, and built-product evidence.
- Real captures and recordings come from the built product. A missing capture remains pending, and a mock or source preview cannot be used as proof.

### Public guidance and reporting

- Keep this mirror and [`AGENTS.md`](AGENTS.md) sanitized. Do not add machine names, host details, credentials, private paths, private conversation vocabulary, or user-specific payloads.
- Report security concerns through the private channel when available. Public issues contain only a safe summary and an affected version or commit.
- Record external blockers precisely and leave related roadmap items unticked until the evidence exists.

</details>
