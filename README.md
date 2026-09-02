# Claude Design Desktop

> **Status: extraction in progress.** This checkout contains product records and an early Windows x64 desktop integration. It is not a published installer or a release-ready application.

Claude Design Desktop is an unofficial desktop shell for Claude Design workflows. It is designed to keep the product identity stable while routing configured requests through the user's local gateway. It is not affiliated with Anthropic, OpenAI, or any provider that may be connected through the gateway.

## At a glance

- License: [MIT](LICENSE)
- Platform scope: Windows x64 only for this delivery phase
- Product records: [`docs/product/README.md`](docs/product/README.md)
- Extraction record: [`provenance/extraction.md`](provenance/extraction.md)
- Current plan: [`ROADMAP.md`](ROADMAP.md)
- Current handoff: [`HANDOFF.md`](HANDOFF.md)

## Contents

1. [What is here](#what-is-here)
2. [What is not shipped](#what-is-not-shipped)
3. [Privacy and security](#privacy-and-security)
4. [Build and contribution](#build-and-contribution)
5. [Documentation](#documentation)
6. [License and notices](#license-and-notices)

## What is here

The current source includes the Electron integration that discovers the Claude Design plugin, selects its configured frontend route, and mediates matching requests through the local gateway. Focused unit tests cover URL selection, plugin asset discovery, and request-interception helpers. These statements describe source coverage in this checkout, not a packaged release.

## What is not shipped

The following are intentionally not claimed as complete:

- A packaged installer or signed executable
- A verified Squirrel.Windows release
- A complete application shell with every planned user-facing surface
- A published documentation or landing site
- Real built-artifact screenshots or a screen recording
- The bundled `@openai/codex` runtime and its release-specific version record

The root package manifest, one-click build scripts, installer script, and capture harness are also absent from this extraction baseline. The roadmap keeps those items open until their implementation and evidence land.

## Privacy and security

The product is designed around local-only project and sharing state. A user-initiated configured request may cross the gateway boundary, but credentials, private paths, and raw private payloads must not enter logs, captures, exports, documentation, or public issue reports. See [`SECURITY.md`](SECURITY.md) for the reporting route and the full security model.

## Build and contribution

The supported build route will be `build.bat /s`, followed by `build-installer.bat /s` for an installer, once the root scripts and package manifest land. They are not available in this baseline, so no local build or installer result is claimed. Contribution boundaries and the planned verification route are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentation

The product documentation is grouped under [`docs/product/`](docs/product/). Each article states its current verification boundary and ends with suggested next articles. The site-facing `docs/src` content is owned by another lane and is deliberately unchanged here.

<details>
<summary>License and notices</summary>

The product source preserves the MIT notice from the extraction source. The bundled `@openai/codex` runtime, when it is added to the package, carries its Apache-2.0 notice separately in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

</details>

<details>
<summary>Captures and recording</summary>

No genuine built-artifact capture or screen recording exists in this baseline. Adding a mock, design preview, or placeholder image would misrepresent the current state. The capture and recording work remains unticked in [`ROADMAP.md`](ROADMAP.md).

</details>
