# Design parity inventory

This inventory is hand-written and fail-closed. Each row names one deterministic screen and state, its local data source, the Electron route, its Material Design 3 audit, and the evidence paths reserved for the built reference and production application. The production side remains unverified until the standalone product has a built package.

Run the structural check with:

```text
node parity/verify.mjs
node parity/verify.mjs --negative
```

The negative run removes one exact screen row and one exact route field in memory. It must go red for both removals, then return green for the restored inventory. A passing negative run is not visual evidence.
