# Handoff

## Current state

This working tree carries the integrated construction checkpoint for the standalone Claude Design Desktop extraction. It is based on source commit `4a3c267e7e22f6636a02542554309cd49cd41e9d` from `Ding-Ding-Projects/claude-code-router` and is checked out on `codex/standalone-foundation` pending default-branch integration.

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

The integrated tree contains the reviewed runtime shell, public preview, universal pending registry, local model core, appearance foundation, deterministic design-reference application, owned branding, disabled converter foundation, and release tooling. Account and project hosts, migration, full compatibility, complete utilities, captures, router handoff/removal, and stable release remain open.

## Verified local package checkpoint

- `build.bat /s` completed from the root and materialized the pinned Electron runtime.
- `build-installer.bat /s` completed through genuine unsigned Squirrel.Windows packaging.
- `Setup.exe` SHA-256: `f09a97f2e209041b9f15fb8ace9cb94b1f7dae75d267f71858de370ebdb0b6d3`.
- `Setup.exe`, `Claude Design Desktop.exe`, and the execution stub have empty PE certificate tables.
- The full `.nupkg` is referenced by `RELEASES`, contains `app.asar`, and contains the pinned Codex app-server runtime.
- The packaged executable carries the committed `16`, `24`, `32`, `48`, `64`, `128`, and `256` pixel icon set.
- The desktop title bar and BrowserWindow consume the committed mark.
- The public page carries an absolute HTTPS Open Graph image URL, image dimensions, alt text, and a large-card declaration. The root and served images are byte-identical.
- Root TypeScript, 22 focused desktop tests, release tooling, runtime validation, updater validation, static site inventory, design-reference checks, branding checks, and 26 converter package tests passed before this checkpoint.

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
| Third-party notice | `THIRD_PARTY_NOTICES.md`, packaged runtime | Notice recorded and runtime packaged; release-page proof pending |
| Security model | `SECURITY.md`, `docs/product/security.md` | Verified as documentation |
| Source extraction provenance | `provenance/extraction.md` | Baseline and filter recorded |
| Stable identity | `README.md`, `docs/product/overview.md` | Values recorded; runtime proof pending integration |
| Shell source checks | `package.json`, `apps/desktop`, `packages/ui-shell` | Integrated; 22 focused tests passed before this merge |
| Public preview source checks | `site/test-*.mjs` | Integrated; source and controller checks passed |
| Release build route | Root build scripts and `dist/squirrel-windows/squirrel-windows` | Locally verified; public release proof pending |
| Captures and recording | `README.md`, `ROADMAP.md` | Pending; no real capture exists |

## Open blockers

1. The target repository's remote has no published refs yet. Verify the first intended default-branch push and prerelease transaction before cleanup.
2. The local package is a construction preview only. Authentication, project-domain integration, migration, compatibility, and most canonical feature surfaces remain unmerged or incomplete.
3. The repository has no verified capture or recording in this baseline.
4. The exact `@openai/codex@0.152.1` runtime is packaged and schema-checked, but real two-profile authentication and OS-vault isolation remain unverified.
5. The 16,728-line historical module `packages/electron/bundled-plugins/claude-design/index.cjs` is present in the extraction material and must be absent from the shipping tip.
6. The shipping product still needs a router bridge migration proof followed by bridge removal proof. No router bridge may remain in the 1.0.0 shipping product.
7. `npm audit` reports two high-severity findings through the exact `electron@42.3.3` pin. The available patched 42.x version is `42.11.1`; no pin change was made because the approved plan names `42.3.3` exactly. Stable release remains blocked pending that product decision.

## Next owner

This construction checkpoint was requested before the complete product was finished. Preserve every unmerged lane at its committed tip. Next, integrate the remaining independently reviewed domain packages, remove the historical hosted/runtime paths from the shipping tree, complete real built-product interaction evidence, and execute the router bridge migration then removal before 1.0.0. Preserve the 2025 `musistudio` MIT notice. Keep every open roadmap item unticked until the corresponding built-product proof exists.

## Suggested reading

- [`docs/product/overview.md`](docs/product/overview.md)
- [`docs/product/licensing.md`](docs/product/licensing.md)
- [`docs/product/security.md`](docs/product/security.md)
- [`docs/product/release-readiness.md`](docs/product/release-readiness.md)
