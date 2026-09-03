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

The product-record lane added public root records and categorized product documentation. The integrated tree now also contains the reviewed runtime-shell foundation and the reviewed public preview foundation. Release tooling, account and project hosts, migration, captures, packaging, and stable release remain open.

## Integrated preview foundation

- `site/index.html`, `site/styles.css`, and `site/app.js` form a local-asset responsive preview.
- `site/storage.js` provides versioned IndexedDB visitor state, while `site/controllers.mjs` owns tab, group, lock, and scoped-search behavior.
- `site/regex-worker.js` provides bounded off-main-thread regex evaluation. Multi-factor choices without a verifier remain visible only as disabled options with exact pending reasons.
- `docs/README.md` indexes thirty feature articles under `docs/features/`. Every feature row remains pending full implementation and built evidence.
- `site/test-static.mjs`, `site/test-behavior.mjs`, `site/test-app-integration.mjs`, and `site/test-regex-dispatch.mjs` pass on the integrated source. They are source and controller checks, not deployed-site or capture proof.

## Verified records

| Record | Evidence | State |
| --- | --- | --- |
| Product identity and scope | `README.md`, `docs/product/overview.md` | Verified as documentation |
| MIT license | `LICENSE` | Preserved from source baseline |
| Third-party notice | `THIRD_PARTY_NOTICES.md` | Notice recorded; runtime package not yet present |
| Security model | `SECURITY.md`, `docs/product/security.md` | Verified as documentation |
| Source extraction provenance | `provenance/extraction.md` | Baseline and filter recorded |
| Stable identity | `README.md`, `docs/product/overview.md` | Values recorded; runtime proof pending integration |
| Shell source checks | `package.json`, `apps/desktop`, `packages/ui-shell` | Integrated; 22 focused tests passed before this merge |
| Public preview source checks | `site/test-*.mjs` | Integrated; source and controller checks passed |
| Release build route | `CONTRIBUTING.md`, `docs/product/build-and-contribute.md` | Planned; installer path not yet verified |
| Captures and recording | `README.md`, `ROADMAP.md` | Pending; no real capture exists |

## Open blockers

1. The current extraction has a root package manifest and focused shell checks, but no verified one-click installer build, so no runnable packaged product or installer can be claimed yet.
2. The target repository's remote has no published refs yet. Verify the first intended default-branch push and release transaction before cleanup.
3. The repository has no verified capture or recording in this baseline.
4. The `@openai/codex` runtime notice is recorded, but its exact packaged version and source revision must be added when the runtime lane lands.
5. The 16,728-line historical module `packages/electron/bundled-plugins/claude-design/index.cjs` is present in the extraction material and must be absent from the shipping tip.
6. The shipping product still needs a router bridge migration proof followed by bridge removal proof. No router bridge may remain in the 1.0.0 shipping product.
7. `npm audit` reports two high-severity findings through the exact `electron@42.3.3` pin. The available patched 42.x version is `42.11.1`; no pin change was made because the approved plan names `42.3.3` exactly. Stable release remains blocked pending that product decision.

## Next owner

The integration owner has reconciled the nine root-record add/add conflicts by retaining product identity and provenance together with the current preview implementation and source checks. Next, integrate the remaining reviewed domain packages, remove the historical hosted/runtime paths from the shipping tree, run the real build and installer routes, and replace this source-only handoff with exact packaged evidence. Preserve the 2025 `musistudio` MIT notice and complete the router bridge migration then removal before 1.0.0. Keep every open roadmap item unticked until the corresponding built-product proof exists.

## Suggested reading

- [`docs/product/overview.md`](docs/product/overview.md)
- [`docs/product/licensing.md`](docs/product/licensing.md)
- [`docs/product/security.md`](docs/product/security.md)
- [`docs/product/release-readiness.md`](docs/product/release-readiness.md)
