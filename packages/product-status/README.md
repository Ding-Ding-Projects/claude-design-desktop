# Product status projection

This package creates the truthful status projection consumed by the local Status Hub integration. It carries exact provenance from the running build: version, full commit SHA, and recorded build or release time with timezone. Missing provenance is represented as unavailable values rather than launch-time guesses.

Evidence is explicit and has one of unrun, running, failed, or verified. A projection becomes verified only when it contains at least one evidence row and every row is verified. A failed or running row takes precedence over a verified row.

Publishing is fail-closed. Without an enrolled Status Hub transport, publish returns enrollment-unavailable and states that no delivery was attempted. Transport exceptions return failed. Only a completed transport call returns delivered; the package does not infer delivery from local state.

The focused tests cover exact provenance, unavailable enrollment, transport failures, and the negative unverified-evidence regression.
