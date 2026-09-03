# Stable product identity

## Approved fields

These values identify the shipping product and must remain stable across releases:

| Field | Stable value |
| --- | --- |
| Package | `@ding-ding-projects/claude-design-desktop` |
| App ID | `com.dingdingprojects.claudedesigndesktop` |
| Executable | `Claude Design Desktop` |
| Protocol | `claude-design-desktop` |
| Local data root | `%LOCALAPPDATA%\\Ding-Ding-Projects\\ClaudeDesignDesktop` |
| Public URL | `https://ding-ding-projects.github.io/claude-design-desktop/` |

The public URL is the documentation and landing destination. It is not the desktop runtime, and the runtime must not contact it as a hosted shell. The runtime must not contact the legacy `claude-code-router` project either.

## Display-label separation

The user-facing display label is presentation state. It may be renamed and reset by a future settings surface, but it must never change the package, app ID, executable, protocol, local data root, update feed, or public URL. Diagnostics and release records use the stable product identity so that a renamed label cannot make the product ambiguous.

## Historical extraction boundary

The extraction contains historical compatibility material that used hosted-shell, router, and provider-routing paths. That material is not the shipping product. The 16,728-line module `packages/electron/bundled-plugins/claude-design/index.cjs` must be absent from the shipping tip, and the release checks must fail if it is present.

## Verification state

The values are recorded from the runtime and release-tooling lanes. A packaged runtime, installed data-root probe, protocol activation proof, and shipping-tip exclusion scan remain pending integration.

## Suggested articles

- [Product overview](overview.md)
- [Security and privacy](security.md)
- [Release readiness](release-readiness.md)
