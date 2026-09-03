# Release tooling

This folder records the public release contracts for Claude Design Desktop.

## Build route

Run `download-dependencies.bat /s` to bootstrap the pinned Node runtime and the exact lockfile. Run `build.bat /s` for the runnable build, then `build-installer.bat /s` for the unsigned Squirrel.Windows installer. Interactive runs offer to launch only after a successful build. Silent runs never prompt.

The scripts use the local pinned Node runtime instead of whichever runtime happens to be on `PATH`. The dependency manifest records the Node archive SHA-256 and npm package integrity values. Installed editors, browsers, and servers are optional integrations, not prerequisites for the application.

## Installer contract

The package identity is `com.dingdingprojects.claudedesigndesktop`. A valid package contains `Setup.exe`, `RELEASES`, a full `.nupkg`, `resources/app.asar`, and the bundled app-server runtime. `scripts/validate-squirrel-package.ps1` checks these paths, verifies the `RELEASES` reference, checks the setup file's Authenticode state is `NotSigned`, and reports its SHA-256. Code signing is prohibited, so an operating system unknown-publisher warning is expected.

## Release workflow

`.github/workflows/release.yml` runs on every push and on `workflow_dispatch`, builds only the Windows x64 package, collects safe outputs on failure, creates one unique non-draft release, and records workflow timing, line counts, the commit, the public dim-sum code-name link, and the unsigned verification boundary. The workflow runs no tests, lint, type checks, accessibility checks, or capture jobs. Those checks belong to local development work and are never represented as workflow verification.

The release workflow uses `RELEASE_TOKEN`, then `ORG_TOKEN`, then `GITHUB_TOKEN` through `GH_TOKEN` without printing credentials. It does not attach copied dim-sum photos. Code-name resolution links to published assets in the public `Ding-Ding-Projects/dim-sum-photos` release catalog.

Code-name reuse is prevented from both local history and the published release bodies of this project. Local release tooling may keep `release-history.json` as a cache, while the published release body remains the durable record used by CI and future clean checkouts.
