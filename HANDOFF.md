# Handoff

## Scope

This lane owns the static documentation and landing-site source in `site/` and `docs/`. It does not own the desktop runtime, app-server integration, compatibility adapters, packaging, releases, or router removal.

## Implemented

- `site/index.html`, `site/styles.css`, and `site/app.js` form a local-asset responsive surface with tabs, visitor settings, local search, anchored regex workbench, command palette, context actions, status, downloads, changelog, and provenance states.
- `site/storage.js` provides a versioned IndexedDB visitor store for tab, group, lock, and other larger local state; `site/controllers.mjs` contains executable tab, group, lock, and scoped-search controllers.
- `site/regex-worker.js` runs regex-mode matching off the main page thread with 2,048-character pattern and 100,000-character sample bounds; multi-factor lock policies remain visible but disabled with exact pending-verifier reasons in the browser-only preview.
- `docs/README.md` indexes thirty feature articles under `docs/features/`.
- `site/test-static.mjs` checks the hand-written inventory, article parity, responsive metadata, strict CSP, absence of premature Open Graph image metadata, local article rendering, and no remote script or stylesheet. It includes a deliberate mutation probe that must fail before restoring the source.
- `site/test-behavior.mjs` executes controller behavior for tab creation, pinning, grouping, persistence, lock interception, unlock, and scoped search.
- `site/test-app-integration.mjs` proves `app.js` imports the controllers, uses their mutation and lock methods, binds the context-menu search scope, and starts bounded regex evaluation.
- `site/test-regex-dispatch.mjs` exercises asynchronous feature, docs, and context-menu results and proves an older worker response cannot overwrite a newer request.
- Root documentation records the extraction baseline and does not claim an installer or release.

## Verification

`node --check site/app.js`, `node site/test-static.mjs`, `node site/test-behavior.mjs`, `node site/test-app-integration.mjs`, and `node site/test-regex-dispatch.mjs` are the focused source checks for this lane. They validate source contracts and controller behavior only. Final built-artifact, accessibility, touch-device, hosted-site, image, installer, and release verification are not complete here.

## Remaining work

- Merge with the integrated runtime and generate the offline article bundle from this source.
- Bind `site/version.json` to the running release provenance, then replace the intentionally unavailable updated-at state.
- Generate and verify the product-specific social preview and real captures from the packaged application.
- Add the immutable verified installer link only after publication evidence exists.
