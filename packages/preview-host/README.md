# Preview host

This package owns the main-process controller for local Claude Design previews. It accepts bounded HTML and explicitly supplied local assets, returns a small `PreviewHandle`, and emits only lifecycle state or fixed-code error events containing that handle. Every operation is authorized for an account, role, project, and generation. Roles come from the required authoritative principal resolver, never from caller labels.

## Security boundary

- Every handle receives a unique in-memory browser session partition.
- The browser window is hidden until its caller chooses to show it and uses `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, `devTools: false`, and no preload script.
- Preview documents are generated as `data:` URLs. Asset references are replaced with validated, bounded `data:` resources, so the controller never resolves a filesystem path. The request policy allows only the exact generated top-level document URL and exact generated asset URLs for that record. Caller-authored `data:` URLs are rejected.
- The document CSP disables network connections, frames, forms, objects, workers, and base URL changes. Dynamic scripts are supported only when they are explicitly supplied local JavaScript assets and are loaded through `data:` URLs. Inline scripts are rejected. There is no Node integration or preload bridge.
- Navigation, redirects, popups, downloads, permissions, DevTools, and renderer IPC messages are refused at the session or window boundary.
- Reload increments the generation. A previous handle is stale, and a handle from another project or unauthorized actor is refused before any window operation. Showing a preview is an explicit operation.
- Closing and renderer destruction clear service workers, caches, local storage, IndexedDB, WebSQL, and cookies for that session before removing the record. Cleanup attempts all phases and is idempotent.
- HTML attributes and CSS imports are tokenized. Unsupported or unquoted URL-bearing constructs fail closed, including every URL scheme, base tags, refresh metadata, secondary browsing contexts, missing assets, and traversal references.
- Images are checked for signatures, dimensions, and animated frame counts. SVG is checked for safe local content and dimensions. WOFF and WOFF2 signatures are validated, and text assets require strict UTF-8.
- The session request hook uses an exact per-record allowlist. It permits only the generated main-frame `data:` URL and the generated `data:` URLs produced from validated record assets. The `<all_urls>` filter and callback cover non-network schemes too.

## Integration

Construct `PreviewHostController` with `createElectronPreviewAdapters`, which wraps Electron's real `session.fromPartition(partition, { cache: false })` and `BrowserWindow` APIs. Supply both an authoritative principal resolver and an authorization callback. The resolver derives the role from trusted application state, while the authorization callback checks that principal, project, operation, handle, and generation. Keep the adapter invocation in the Electron main package. The injected adapters in `preview-host.test.ts` are the contract probe and are intentionally independent of Electron so policy tests can run in a clean Node process.

The package pins `typescript` and `@types/node` in its local manifest and uses `tsconfig.json` with strict checking. The local install directory is ignored and never committed.

## Desktop integration status

The application main-process wiring is intentionally pending. A later `apps/desktop` integration lane owns construction of the controller, selection of the authoritative principal resolver, and connection of the real BrowserWindow lifecycle. This package does not claim that an installed desktop build already uses the controller.

The session pool lifecycle is also pending integration. The controller currently creates one non-persistent session partition per active handle and cleans it when the handle closes or its renderer is destroyed. Pool reuse, shutdown draining, and application-wide limits must be supplied by the desktop integration lane rather than inferred here.

## Verification

```text
node --experimental-strip-types --test packages/preview-host/preview-host.test.ts
```

The test suite covers adapter construction, CSP and base-tag rejection, unquoted HTML URLs, srcset, CSS imports, every URL scheme, embedded local assets, dynamic local scripts, inline-script refusal, popup and navigation refusal, permission and download refusal, renderer IPC isolation, hardened browser preferences, per-handle session isolation, actor and role authorization, explicit show, stale generations, cross-project handles, capacity, lifecycle watchdogs, destruction, and storage cleanup.
