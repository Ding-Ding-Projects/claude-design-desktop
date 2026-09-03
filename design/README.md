# Claude Design Desktop reference surfaces

This folder contains the checked-in visual reference source for the standalone desktop product. The reference is data-driven: `reference/screens.json` is the screen and state source, and `reference/index.html` renders that source directly without a hosted service or copied third-party shell.

The live Material Designer creation and export route was checked on 2026-09-02. The checkout contains `design/apps/desktop/package.json`, but the declared Electron package and executable are absent, so the route cannot be launched in this environment. The local reference route is therefore the sanctioned fallback. This is recorded in `reference/handoff.md` and does not claim that the unavailable route produced a prototype.

## Launch

From the repository root, after the root package has installed its pinned Electron dependency:

```text
npm --prefix design/apps/design-reference run reference -- --screen projects --state default --theme light --locale en-US --width 1280 --height 800 --scale 1 --time 2026-09-02T12:00:00.000Z --motion frozen --network disabled
```

The reference launcher resolves Electron from the repository root package. It does not install a second nested Electron copy. The root package must pin Electron to `42.3.3`; when that root package is absent, the launcher fails with an explicit missing-root-runtime message.

The renderer reads the route tuple from the query string. Supported screens are `signin`, `accounts`, `projects`, `editor`, `sharing`, `settings`, `features`, `downloads`, and `recovery`.

The app is developer-only evidence. It is not the installed product, and a reference screen does not prove production behavior.
