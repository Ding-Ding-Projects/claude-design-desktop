# Build and contribution

## Current state

This checkout is an early Windows x64 extraction. It does not yet include a root package manifest, one-click dependency bootstrap, `build.bat`, `build-installer.bat`, or a packaged application. No build or installer result is claimed from this baseline.

## Planned supported route

When the build lane lands, a clean checkout will use:

```text
build.bat /s
build-installer.bat /s
```

The first script will obtain missing toolchain components and produce a runnable build. The second will produce the same unsigned Squirrel.Windows installer family used for release. Both scripts must report exact paths, hashes, versions, and failures without prompting in silent mode.

## Contribution route

1. Read the [Product overview](overview.md), [`ROADMAP.md`](../../ROADMAP.md), and [`AGENTS.md`](../../AGENTS.md).
2. Inspect the checkout status and preserve unrelated work.
3. Keep implementation, documentation, tests, and evidence in the smallest coherent change.
4. Run the focused checks that apply to the changed paths once the workspace toolchain exists.
5. Record remaining external or built-artifact limitations in the handoff and leave roadmap items unticked.

## Public-record rules

Do not publish private paths, credentials, user project contents, or development-only claims. Keep the unofficial affiliation disclaimer intact. Update categorized documentation in the same change as user-visible behaviour.

## Verification boundary

The existing Electron unit-test files are source evidence only until the target workspace has a package manifest and a reproducible toolchain. A source test or a design preview cannot substitute for packaged-runtime evidence.

## Suggested articles

- [Release readiness](release-readiness.md)
- [Security and privacy](security.md)
- [Product overview](overview.md)
