# Completeness and runtime retirement checks

This directory contains the hand-written quality inventories for the desktop application and its documentation site.

## Checks

Run the executable check from the repository root:

```text
node quality/check-completeness.mjs
```

The check validates all 30 canonical feature rows on both user-facing surfaces. Every row names an implementation registration, documentation article, English localization, Traditional Chinese localization, bilingual localization, persistence and reset behavior, focused test, built interaction receipt, genuine capture receipt, recording when motion applies, data boundary, supported and unavailable evidence, and a negative case. Missing paths are reported as failures. The check also validates version provenance and exact design-reference parity tuples.

The retired-runtime scan reads `quality/retired-runtime-patterns.json` and rejects the old hosted origin, fixture identity, router and gateway wiring, custom protocol handler, interception hooks, request-body logging, legacy runtime paths, and package-output wiring. Source comments are removed before code scanning so a commented-out line cannot satisfy or evade the check.

Run the red-then-green mutation checks with:

```text
node quality/check-completeness.mjs --self-test
```

The self-tests remove implementation, route, localization, article, focused test, interaction receipt, capture receipt, package content, and source-symbol entries one at a time. Each mutation must fail, and the original inventory must pass immediately after restoration. Design parity and retired-runtime manifest mutations are covered as separate cases.

The current extraction base is expected to report failures. The missing feature paths and evidence are intentional until the implementation lanes land, and the retired-runtime findings document paths that still need removal. A green self-test means the checks themselves are sound, not that the product is complete.

## Evidence rules

Evidence paths are repository-relative literals. Receipts must bind the source commit, built package digest, route, viewport, scale, theme, and privacy result. A capture receipt is not satisfied by a filename alone. Version information comes from package metadata and a recorded build provenance file, with a labeled local timezone and seconds. Invalid provenance must render an explicit unavailable state.

Design parity entries use one exact state, theme, viewport, and display scale for the reference and built application. Each entry names both routes, the Material Design audit, raw captures, a labeled comparison, a machine-readable visual diff, and any intentional deviation with its reason.
