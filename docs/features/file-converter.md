# File converter

## Behavior

The local converter uses a categorized adapter catalog for Documents/PDF, Images, Audio, Video, Archives, Structured Data/Spreadsheets, Code/Text, and Binary Encodings. Type detection uses bounded bytes, not extensions alone.

## Configuration

Adapters declare signatures, targets, bundled proof, lossiness, resource limits, sandbox boundary, and output validator. The queue is unlimited in length but bounded in concurrency and memory, with pause, resume, cancel, and crash recovery.

## Failure and security

Unbundled formats remain visible but disabled with their exact reason. Outputs are atomic, reopened and validated. Lossy changes are disclosed before conversion, and source files remain untouched.

## Verification

Verify all categories, PDF operations, unavailable states, package proof, byte detection, queue persistence, storage preflight, cancellation, output validation, and narrow accessible controls. Final artifact evidence is pending.

## Suggested articles

[Exports](exports.md), [Bulk actions](bulk-actions.md), [External editor](external-editor.md).
