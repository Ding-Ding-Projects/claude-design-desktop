# Preview host

This package owns the main-process controller for local Claude Design previews. It accepts bounded HTML and explicitly supplied local assets, returns a small `PreviewHandle`, and emits only lifecycle state events containing that handle.

## Security boundary

- Every handle receives a unique in-memory browser session partition.
- The browser window is hidden until its caller chooses to show it and uses `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, `devTools: false`, and no preload script.
- Preview documents are generated as `data:` URLs. Asset references are replaced with validated, bounded `data:` resources, so the controller never resolves a filesystem path.
- The document CSP disables scripts, network connections, frames, forms, objects, workers, and base URL changes. Only inline styles and embedded images, fonts, media, and other explicitly supplied local bytes are allowed.
- Navigation, redirects, popups, downloads, permissions, DevTools, and renderer IPC messages are refused at the session or window boundary.
- Reload increments the generation. A previous handle is stale, and a handle from another project is refused before any window operation.
- Closing clears service workers, caches, local storage, IndexedDB, WebSQL, and cookies for that session before destroying the window.

## Integration

Construct `PreviewHostController` with adapters around Electron's `session.fromPartition`, `BrowserWindow`, and their event APIs. Keep the adapter implementation in the Electron main package. The injected adapters in `preview-host.test.ts` are the contract probe and are intentionally independent of Electron so the policy tests can run in a clean Node process.

## Verification

```text
node --experimental-strip-types --test packages/preview-host/preview-host.test.ts
```

The test suite covers CSP and base-tag rejection, embedded local assets, network refusal, popup and navigation refusal, permission and download refusal, renderer IPC isolation, hardened browser preferences, per-handle session isolation, stale generations, cross-project handles, and storage cleanup.
