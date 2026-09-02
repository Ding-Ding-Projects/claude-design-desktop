# Handoff

## Scope

This lane owns the static documentation and landing-site source in `site/` and `docs/`. It does not own the desktop runtime, app-server integration, compatibility adapters, packaging, releases, or router removal.

## Implemented

- `site/index.html`, `site/styles.css`, and `site/app.js` form a local-asset responsive surface with tabs, visitor settings, local search, anchored regex workbench, command palette, context actions, status, downloads, changelog, and provenance states.
- `docs/README.md` indexes thirty feature articles under `docs/features/`.
- `site/test-static.mjs` checks the hand-written inventory, article parity, responsive metadata, and no remote script or stylesheet.
- Root documentation records the extraction baseline and does not claim an installer or release.

## Verification

`node --check site/app.js` and `node site/test-static.mjs` are the focused checks for this lane. Final built-artifact, accessibility, touch-device, hosted-site, image, installer, and release verification are not complete here.

## Remaining work

- Merge with the integrated runtime and generate the offline article bundle from this source.
- Bind `site/version.json` to the running release provenance, then replace the intentionally unavailable updated-at state.
- Generate and verify the product-specific social preview and real captures from the packaged application.
- Add the immutable verified installer link only after publication evidence exists.
