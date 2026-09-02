# Shared contract package

This package contains public-safe types and small pure helpers shared by the desktop application and browser documentation surface. It does not claim to be the completed user interface. Owning lanes must provide the real host wiring, persistence, routes, localized resources, focused checks, built interaction receipts, and captures before an inventory row can move from `pending` to `verified`.

## Boundary

The package never handles credentials, private vocabulary payloads, unrestricted process handles, or raw host protocol connections. Unsupported work stays explicit through capability results with a reason. Host adapters own platform storage, credential vault access, network policy, rendering, and server-side grading.

## Verification

Build with `npx tsc -p packages/universal-features/tsconfig.json`. Run `node --test packages/universal-features/test/universal-features.test.mjs` after building. The [feature inventory](../FEATURE_INVENTORY.md) is a hand-written list with 60 explicit desktop and site rows. Its negative regression must turn red when one row is removed or a required implementation path is missing.
