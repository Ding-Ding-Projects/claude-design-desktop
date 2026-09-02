# Release readiness

## Delivery target

The active release target is Windows x64. Other operating-system installers and release assets are outside the current scope unless the project explicitly reopens them.

## Installer requirements

A supported Windows release must use genuine Squirrel.Windows packaging and include the complete installer set required by the release manifest, including `Setup.exe`, `RELEASES`, and the full `.nupkg` package. The installer is unsigned. Release notes must state that an unknown-publisher or SmartScreen warning may appear.

## Runtime and notices

The packaged application must prove that every required runtime is inside the installer and discoverable by the running product. If `@openai/codex` is bundled, its exact version, source revision, Apache-2.0 notice, and package hash must be recorded with the release evidence.

## Evidence required before publication

- A clean Windows x64 build through the supported root scripts
- An installer hash tied to the intended commit
- A runtime probe from the installed package, not only packaging configuration
- A release record with unique version and provenance
- Real captures of the built application and its error and empty states
- A screen recording of one genuine user path, when the capture harness is available
- A documentation and notice review matching the shipped contents

## Current state

No installer, release, capture, recording, or packaged runtime is verified in this extraction baseline. The release checklist therefore remains open in [`ROADMAP.md`](../../ROADMAP.md).

## Suggested articles

- [Build and contribution](build-and-contribute.md)
- [Licensing and attribution](licensing.md)
- [Security and privacy](security.md)
