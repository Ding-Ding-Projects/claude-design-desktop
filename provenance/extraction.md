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

## What this record does not prove

- It does not prove that the complete source product has been extracted.
- It does not prove that a package manifest, installer, or release exists.
- It does not prove that the built application can find every bundled runtime.
- It does not replace a built-artifact capture or a release-specific dependency notice.

## Suggested articles

- [Product overview](../docs/product/overview.md)
- [Build and contribution](../docs/product/build-and-contribute.md)
- [Release readiness](../docs/product/release-readiness.md)
