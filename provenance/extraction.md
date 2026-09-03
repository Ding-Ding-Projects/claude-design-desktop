# Extraction provenance

## Source baseline

The standalone product records are anchored to the following source revision:

| Field | Value |
| --- | --- |
| Source repository | `Ding-Ding-Projects/claude-code-router` |
| Source revision | `4a3c267e7e22f6636a02542554309cd49cd41e9d` |
| Source subject | `docs: rewrite HANDOFF for the merged release train` |
| Author date | `2026-08-22T20:21:56-04:00` |
| Source license | MIT, copyright `2025 musistudio` |
| Extraction target | `Ding-Ding-Projects/claude-design-desktop` |
| Delivery scope | Windows x64 only during this extraction phase |

The source revision was verified as a commit object before documentation was written. The baseline is a provenance anchor, not a claim that every source feature has already moved into the standalone product.

## Source-to-filtered mapping

| Source revision | Filtered target revision | Meaning |
| --- | --- | --- |
| `4a3c267e7e22f6636a02542554309cd49cd41e9d` | `dfdffe8` | Historical source baseline mapped to the existing standalone extraction tip |
| `4a3c267e7e22f6636a02542554309cd49cd41e9d` | `6dfcfdb0b0310c50c50e91e9a625622c2c85968c` | Product-record documentation added after the extraction tip |

The filtered tip for the extraction is `dfdffe8`. The product-record commits after that tip are documentation records and do not broaden the filtered source set.

## Filtered-history method

The extraction keeps history reviewable by recording the source revision and the path families inspected for the desktop product. The path filter is intentionally explicit:

```text
packages/electron/
packages/core/
packages/ui/
build/
docs/
```

The corresponding read-only history queries are:

```text
git log --follow --format=%H|%aI|%s 4a3c267e7e22f6636a02542554309cd49cd41e9d -- packages/electron packages/core packages/ui build docs
git rev-list --reverse 4a3c267e7e22f6636a02542554309cd49cd41e9d -- packages/electron packages/core packages/ui build docs
```

These queries identify the filtered history that informs the extraction. No source commit was rewritten, squashed, or silently relabelled by this documentation lane. The target checkout began from the existing standalone baseline `dfdffe8`, so later implementation commits must retain their own source and target SHAs in the integration handoff.

## Retained paths and source mapping

The extraction retained these exact paths at the baseline. The historical source commit beside each path is the latest matching source revision at or before `4a3c267e7e22f6636a02542554309cd49cd41e9d`:

| Retained path | Source revision | Shipping status |
| --- | --- | --- |
| `packages/electron/bundled-plugins/claude-design/index.cjs` | `551fc0e8efd02caaf38a7803f70eadbfbd2a4900` | Historical only; 16,728 lines must be absent from shipping tip |
| `packages/electron/bundled-plugins/claude-design/plugin.json` | `31c14ea82ebe9c6119559d7c861c57945e8d8d22` | Historical extraction material |
| `packages/electron/bundled-plugins/claude-design/README.md` | `1f5cc499f11f441372b2463acf2d053ee83fc85b` | Historical extraction material |
| `packages/electron/src/main/claude-design-window.ts` | `1f5cc499f11f441372b2463acf2d053ee83fc85b` | Historical extraction material |
| `packages/electron/src/main/plugin-app-url.ts` | `1f5cc499f11f441372b2463acf2d053ee83fc85b` | Historical extraction material |
| `packages/electron/test/unit/claude-design-plugin-assets.test.ts` | `551fc0e8efd02caaf38a7803f70eadbfbd2a4900` | Historical focused checks |
| `packages/electron/test/unit/claude-design-window.test.ts` | `1f5cc499f11f441372b2463acf2d053ee83fc85b` | Historical focused checks |
| `packages/electron/test/unit/plugin-app-url.test.ts` | `1f5cc499f11f441372b2463acf2d053ee83fc85b` | Historical focused checks |
| `build/build.mjs` | `b4afa55c492d7443a071a1d62dbc740ec8dd3f08` | Shared historical build material |
| `build/esbuild.config.mjs` | `b4afa55c492d7443a071a1d62dbc740ec8dd3f08` | Shared historical build material |
| `docs/src/content/docs/en/configuration/agents/claude-design.md` | `013965d95f15d604b7e7b4619710574e87638b4c` | Site-owned documentation input |
| `docs/src/content/docs/zh/configuration/agents/claude-design.md` | `013965d95f15d604b7e7b4619710574e87638b4c` | Site-owned documentation input |

The first five paths contain the historical hosted-shell and router compatibility implementation. They are recorded so the removal scan can name the exact paths; they are not a license to ship those paths.

## Scan evidence placeholders

The following evidence slots are deliberately visible until integration fills them:

| Scan | Expected evidence | State |
| --- | --- | --- |
| Source baseline object | `git cat-file -t 4a3c267e7e22f6636a02542554309cd49cd41e9d` returns `commit` | Verified before this record |
| Retained-path comparison | Source-to-target path and blob report | Pending integration |
| Historical module exclusion | Shipping-tip scan proves `packages/electron/bundled-plugins/claude-design/index.cjs` is absent | Pending runtime removal |
| Hosted-shell/router contact exclusion | Shipping build and source scan contain no hosted-shell or router path | Pending runtime removal |
| Two-profile runtime proof | Two isolated Windows profiles open the same stable identity and data-root contract | Pending packaged build |
| Preview progression | Preview, release candidate, and stable `1.0.0` records carry matching provenance | Pending release lane |

## What this record does not prove

- It does not prove that the complete source product has been extracted.
- It does not prove that a package manifest, installer, or release exists.
- It does not prove that the built application can find every bundled runtime.
- It does not replace a built-artifact capture or a release-specific dependency notice.

## Suggested articles

- [Product overview](../docs/product/overview.md)
- [Build and contribution](../docs/product/build-and-contribute.md)
- [Release readiness](../docs/product/release-readiness.md)
