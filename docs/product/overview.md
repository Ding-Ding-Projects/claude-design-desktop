# Product overview

## Purpose

Claude Design Desktop is an unofficial Windows x64 desktop shell for Claude Design workflows. The intended shell keeps the product identity stable while mediating configured requests through the user's local gateway. The current checkout is an extraction in progress, not a released application.

## Product identity

The stable product identity is the package and executable identity chosen by the project. A future display-name preference may change labels shown in the interface, but it must not move the data directory, package identifier, executable name, update feed, or other installation identity.

## Current source evidence

The current source includes Electron integration for plugin status, frontend route selection, asset discovery, and request mediation. Focused tests exist under `packages/electron/test/unit/`. The root package manifest, installer scripts, complete shell, and capture harness are not present in this extraction baseline.

## Boundaries

- The current delivery target is Windows x64.
- The product is not affiliated with Anthropic, OpenAI, or any connected provider.
- The desktop shell is not a replacement for upstream products and does not claim their endorsement.
- Local project and sharing state remains local unless the user explicitly starts a configured request or sharing operation.
- The documentation site, when published, will describe and link to the application. It is not the application runtime.

## Verification state

No packaged application, installer, release, real capture, or screen recording is claimed by this baseline. The next owner must verify the built product before marking user-facing roadmap items complete.

## Suggested articles

- [Licensing and attribution](licensing.md)
- [Security and privacy](security.md)
- [Build and contribution](build-and-contribute.md)
