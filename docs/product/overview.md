# Product overview

## Purpose

Claude Design Desktop is an unofficial local Windows x64 design workspace with a product-owned desktop shell. The shipping product never contacts the hosted shell at `https://claude-design.ccrdesk.top/design` and never contacts the legacy `claude-code-router` project. Hosted-shell, router, and provider-routing code in the source is historical extraction material only and must be absent from the shipping tip. The current checkout is an extraction in progress, not a released application.

## Product identity

The stable product identity is fixed by the approved product contract:

| Field | Stable value |
| --- | --- |
| Package | `@ding-ding-projects/claude-design-desktop` |
| App ID | `com.dingdingprojects.claudedesigndesktop` |
| Executable | `Claude Design Desktop` |
| Protocol | `claude-design-desktop` |
| Local data root | `%LOCALAPPDATA%\\Ding-Ding-Projects\\ClaudeDesignDesktop` |
| Public URL | `https://ding-ding-projects.github.io/claude-design-desktop/` |

A future display-label preference may change labels shown in the interface, but it must not move the data directory, package identifier, app ID, executable name, protocol, update feed, or public URL.

## Current source evidence

The current source includes historical Electron integration for plugin status, frontend route selection, asset discovery, and request mediation. Focused tests exist under `packages/electron/test/unit/`. That historical source is not the shipping product contract. The root package manifest, installer scripts, complete shell, and capture harness are not present in this extraction baseline.

## Boundaries

- The current delivery target is Windows x64.
- The product is not affiliated with Anthropic, OpenAI, or any connected provider.
- The desktop shell is not a replacement for upstream products and does not claim their endorsement.
- Local project and sharing state remains local. The shipping product has no hosted-shell or router dependency.
- The documentation site, when published, will describe and link to the application. It is not the application runtime.

## Verification state

No packaged application, installer, release, real capture, or screen recording is claimed by this baseline. The next owner must verify the built product before marking user-facing roadmap items complete.

## Historical extraction exclusion

The 16,728-line module `packages/electron/bundled-plugins/claude-design/index.cjs` is historical extraction material. It must be absent from the shipping tip. The removal proof belongs to the runtime and release lanes, not this documentation lane.

## Suggested articles

- [Licensing and attribution](licensing.md)
- [Security and privacy](security.md)
- [Build and contribution](build-and-contribute.md)
