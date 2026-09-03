# Local converter core

This package provides the local conversion contracts used by the desktop application. It does
not enable an adapter merely because a command is available on `PATH` or because a developer
machine can run it. An adapter is enabled only when its payload is bundled and a packaged-artifact
SHA-256 proof is present.

## Included capabilities

- A categorized registry covering Documents/PDF, Images, Audio, Video, Archives, Structured
  Data/Spreadsheets, Code/Text, and Binary Encodings.
- Bounded byte-signature detection that never relies on a filename extension.
- Explicit metadata, encoding, lossiness, sandbox, resource-limit, and output-validation contracts.
- PDF inspect, split, merge, extract, reorder, rotate, and metadata operation planning, including
  honest refusal for encrypted or signed inputs without an explicitly capable adapter.
- Atomic output publication after validation, with unique temporary files and a post-write readback.
- A durable queue store with paged inspection, bounded concurrency, constant-memory item processing,
  pause/resume, cancellation, partial outcomes, and recovery of interrupted items.
- Destination-space preflight and bounded isolated-runner requests with no ambient network access.

The queue stores source and destination paths, not source bytes, so a long queue does not load every
file into memory. Adapters remain unavailable until the packaged build supplies their proof.
