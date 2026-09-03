# Completeness and runtime retirement checks

This directory contains the hand-written quality inventories for the desktop application and its documentation site.

## Checks

Run the executable check from the repository root:

```text
node quality/check-completeness.mjs
```

The check validates all 30 approved feature rows, with one literal desktop entry and one literal site entry for each row. The approved list includes `status-hub` and `front-screen-provenance`, and uses `accessibility-responsive-sizing` as one combined row. Every row names an implementation registration, documentation article, English localization, Traditional Chinese localization, bilingual localization, persistence and reset behavior, focused test, built interaction receipt, genuine capture receipt, recording when motion applies, data boundary, supported and unavailable evidence, and a negative case. Missing paths are reported as failures. The check also validates version provenance and exact design-reference parity tuples.

The retired-runtime scan reads `quality/retired-runtime-patterns.json` and scans the repository root, hidden workflow directory, build output, package trees, documentation, distribution trees, and staged package trees. It rejects the old hosted origin, fixture identity, static and dynamic router or gateway wiring, CommonJS and ES module imports, custom protocol handlers, CDP and `webRequest` interception hooks, request-body logging, legacy runtime paths, and package-output wiring. Source comments are removed before code scanning so a commented-out line cannot satisfy or evade the check.

Run the red-then-green mutation checks with:

```text
node quality/check-completeness.mjs --self-test
```

The self-tests physically remove or alter implementation fixtures, source symbols, registration calls, localization files, article files, focused tests, interaction receipts, capture receipts, package signatures and membership records, privacy and availability records, recording metadata, and provenance records one class at a time. Each mutation asserts that the file or bytes changed, turns red, and restores green. Design parity tuple, duplicate-tuple, visual-diff, and hash mutations are covered separately, as is an injected prohibited package-content mutation.

The current extraction base is expected to report failures. The missing feature paths and evidence are intentional until the implementation lanes land, and the retired-runtime findings document paths that still need removal. A green self-test means the checks themselves are sound, not that the product is complete.

## Evidence rules

Evidence paths are repository-relative literals. Receipts must bind the source commit, the SHA-256 of the actual implementation bytes, built package digest, exact route, complete language/state/theme/viewport/scale/time/motion tuple, and privacy result. A capture receipt is not satisfied by a filename alone: PNG and WebP signatures, dimensions, frame presence, and capture hashes are checked. Recording receipts require a WebM signature, dimensions, frame presence, duration, frame rate, and recording hash. Package receipts require a genuine Squirrel `Setup.exe`, `RELEASES`, full and delta `.nupkg` ZIPs, an ASAR or equivalent package header, explicit package membership, and retired-runtime scanning after safe unpacking. Version information comes from package metadata and a recorded build provenance file, with a labeled local timezone and seconds. Invalid provenance must render an explicit unavailable state.

Design parity entries use one exact state, language, theme, viewport, display scale, frozen-time setting, and motion setting for the reference and built application. The tuple matrix explicitly lists the required language, theme, viewport, scale, time, and motion combinations. Duplicate tuples are rejected even when their IDs differ. Each entry names both routes, the Material Design audit, raw captures, a labeled comparison, a machine-readable visual diff, non-placeholder hashes bound to those files, and any intentional deviation with its reason and approval.
