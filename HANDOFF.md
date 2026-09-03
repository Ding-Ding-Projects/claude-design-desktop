# Handoff

## Current state

This working tree carries the product-record lane for the standalone Claude Design Desktop extraction. The lane is based on source commit `4a3c267e7e22f6636a02542554309cd49cd41e9d` from `Ding-Ding-Projects/claude-code-router` and is checked out on `codex/product-docs`.

The shipping product contract is local-only. It never contacts the hosted shell at `https://claude-design.ccrdesk.top/design` and never contacts the legacy router. The source files that implement those historical compatibility paths are extraction material and must be removed from the shipping tip.

## Stable identity contract

| Field | Stable value |
| --- | --- |
| Package | `@ding-ding-projects/claude-design-desktop` |
| App ID | `com.dingdingprojects.claudedesigndesktop` |
| Executable | `Claude Design Desktop.exe` |
| Protocol | `claude-design-desktop://` |
| Local data root | `%LOCALAPPDATA%\Ding-Ding-Projects\ClaudeDesignDesktop` |
| Public URL | `https://ding-ding-projects.github.io/claude-design-desktop/` |

The display label is presentation-only. It must not alter any identity field or local data location.

The lane added public root records and categorized product documentation. It did not edit `docs/src`, implementation code, package manifests, build scripts, installer configuration, or capture tooling. Those paths belong to other lanes or remain open.

## Verified records

| Record | Evidence | State |
| --- | --- | --- |
| Product identity and scope | `README.md`, `docs/product/overview.md` | Verified as documentation |
| MIT license | `LICENSE` | Preserved from source baseline |
| Third-party notice | `THIRD_PARTY_NOTICES.md` | Notice recorded; runtime package not yet present |
| Security model | `SECURITY.md`, `docs/product/security.md` | Verified as documentation |
| Source extraction provenance | `provenance/extraction.md` | Baseline and filter recorded |
| Stable identity | `README.md`, `docs/product/overview.md` | Values recorded; runtime proof pending integration |
| Build route | `CONTRIBUTING.md`, `docs/product/build-and-contribute.md` | Planned, not runnable on this baseline |
| Captures and recording | `README.md`, `ROADMAP.md` | Pending; no real capture exists |

## Open blockers

1. The current extraction has no root package manifest or supported one-click build script, so no runnable product or installer can be claimed from this lane.
2. The target repository's remote did not provide a usable remote-tracking ref during the pre-edit fetch. Local `main` and the task baseline were both `dfdffe8`; verify the remote again before integration.
3. The repository has no verified capture or recording in this baseline.
4. The `@openai/codex` runtime notice is recorded, but its exact packaged version and source revision must be added when the runtime lane lands.
5. The 16,728-line historical module `packages/electron/bundled-plugins/claude-design/index.cjs` is present in the extraction material and must be absent from the shipping tip.
6. The shipping product still needs a router bridge migration proof followed by bridge removal proof. No router bridge may remain in the 1.0.0 shipping product.

## Next owner

The integration owner should review this commit against the current site-docs tip `e6d5354`, merge it with the implementation and site lanes, rerun the documentation link checks, then update the handoff with the integrated default-branch commit and real build evidence. Do not resolve the known nine add/add conflicts in this lane; the integration owner should make one deliberate integration commit after the site tip settles. Reconcile both repositories independently, preserve the 2025 `musistudio` MIT notice, and complete the router bridge migration then removal before 1.0.0. Keep every open roadmap item unticked until the corresponding built-artifact proof exists.

## Suggested reading

- [`docs/product/overview.md`](docs/product/overview.md)
- [`docs/product/licensing.md`](docs/product/licensing.md)
- [`docs/product/security.md`](docs/product/security.md)
- [`docs/product/release-readiness.md`](docs/product/release-readiness.md)
