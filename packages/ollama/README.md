# Local model suite core

This package contains the local model-management domain used by the desktop application. It has no catalog fixtures and makes no cloud requests. The transport accepts only loopback HTTP(S) endpoints, rejects credentials and redirects, bounds response bytes and NDJSON records, and exposes health, version, installed-model, running-model, pull, catalog, and streamed chat contracts.

The catalog adapter consumes pages supplied by the local application boundary. It does not invent a model list. A refresh is complete only after the final page and local installed/running reconciliation have succeeded. A failed refresh keeps the last verified state and marks it stale and offline.

Hardware fit is evidence-backed. It requires declared blob and memory metadata plus detected RAM and free disk, and returns `Runs well`, `Runs with limits`, `Unlikely`, or `Unknown`. A model name alone never produces a fit claim.

Pulls use a durable state-store interface, an unlimited metadata queue, bounded worker concurrency, cancellation, retry of failed records, and partial outcomes. Chat validates bounded history and capability-gated attachments before opening the local streaming endpoint. Harness profiles require absolute executable and working paths, an executable extension, shell-syntax-free arguments, allowlisted environment keys, a redacted preview, and a snapshot before launch. A failed health check terminates the process and restores the saved profile.

Run the focused package checks with `npm test` from this directory. TypeScript validation is `npm run typecheck` when the workspace toolchain is available.
