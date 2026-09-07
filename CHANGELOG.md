# Changelog

## Unreleased preview

- Added the responsive documentation and status source.
- Added thirty hand-written feature articles and a fail-closed static inventory check.
- Added local visitor settings, tab navigation, per-field regex tooling, command palette, and honest unverified release states.
- Added the standalone custom-title-bar shell, deterministic design-reference application, owned product branding, and byte-identical social preview assets.
- Added one-click dependency and unsigned Squirrel.Windows packaging paths with bundled Codex app-server validation and executable-icon verification.
- Added the disabled local converter foundation. Native adapters remain unavailable until the Windows restricted-launch implementation is complete.
- Fixed the release workflow so GitHub Actions accepts it: the `runner` and `job` contexts moved out of job-level `env`, the release tag now carries the twelve-character commit prefix, and the used dim-sum code name is recorded in `release-support/release-history.json` so no code name is reused.
- Stopped electron-builder from publishing on its own inside GitHub Actions (`--publish never` and `"publish": null`); the workflow publishes the release with `gh`.
- Fixed the workflow timing step, which subtracted a `DateTime` from a `DateTimeOffset` and failed after the release was already published. First Actions-published release: `preview-7-5b6dcaf66365`.
- Restricted the release workflow to branch pushes. Each published release creates a tag, and the bare push trigger fired on that tag too, spawning a new run and a new release per release. First fully green Actions release: `preview-9-050b38a613f3`.
- Added the GitHub Pages deployment workflow for `site/`, a release manifest generator that binds the site's version, updated-at provenance, and Windows installer download to one verified immutable release, and the focused manifest test.

The completing commit and release date will be added from the verified integrated release history. No release is claimed by this preview lane.
