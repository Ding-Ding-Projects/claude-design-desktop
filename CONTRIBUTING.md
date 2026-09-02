# Contributing

## Before making a change

Read the product documentation index in [`docs/product/README.md`](docs/product/README.md), check the current [`ROADMAP.md`](ROADMAP.md), and inspect the repository status before editing. Keep changes focused and preserve unrelated local work.

The product is currently a Windows x64 extraction in progress. The root package manifest, one-click build scripts, installer packaging, and capture harness are not present in this extraction baseline. Do not invent a working command or claim a packaged result while those files are absent.

## Change boundaries

- Keep public documentation professional and free of credentials, private paths, private vocabulary, and user-specific data.
- Preserve the MIT license and third-party notices in the same change that alters distribution contents.
- Keep local project and sharing behaviour explicit. Do not add a network call merely to make a preview look complete.
- For visible changes, add a real built-artifact capture when the build route exists. Until then, record the missing capture as an open item instead of using a mock or source preview.
- Do not add code signing, signing credentials, or a non-Squirrel Windows installer route.

## Verification route

Once the root build scripts and package manifest land, the supported contributor route will be:

```text
build.bat /s
build-installer.bat /s
```

Those scripts must install their declared toolchain, build the real payload, and report exact output hashes. On this baseline, that route is planned but unavailable. Existing focused tests under `packages/electron/test/unit/` can be run only after the package toolchain and workspace manifest are present.

## Pull requests

Describe the user-visible result, the files changed, the exact verification commands and results, and any remaining external blocker. Do not use a closing keyword for work that is still unverified. Include a documentation update and a roadmap checkbox when the change affects product behaviour.
