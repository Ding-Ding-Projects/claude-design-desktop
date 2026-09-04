# Product status projection

This package creates the truthful status projection consumed by the local Status Hub integration. It carries exact provenance from the running build: version, full commit SHA, package SHA-256, manifest SHA-256, and recorded build or release time with timezone. Missing provenance is represented as unavailable values rather than launch-time guesses.

Evidence is explicit and has one of unrun, running, failed, or verified. A projection becomes verified only when it contains at least one evidence row and every row is verified. A failed or running row takes precedence over a verified row.

Publishing is fail-closed. Without an enrolled Status Hub transport, publish returns enrollment-unavailable and states that no delivery was attempted. A transport must return a typed receipt whose digest matches the immutable projection, then read it back by receipt id. Transport exceptions, invalid receipts, or mismatched read-back return failed. Only a completed transport call plus exact read-back returns delivered; the package does not infer delivery from local state.

The focused tests cover exact package-bound provenance, runtime evidence validation, unavailable enrollment, typed receipt acknowledgement, exact read-back, transport failures, and the negative unverified-evidence regression.
