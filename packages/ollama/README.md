# Local model suite core

This package contains the local model-management domain used by the desktop application. It has no catalog fixtures and makes no cloud requests. The transport accepts only numeric loopback HTTP(S) endpoints, rejects credentials, redirects, DNS-rebinding results, encoded traversal, and undocumented paths, bounds response bytes incrementally, and keeps its deadline active through complete JSON or NDJSON body consumption.

The official catalog-source adapter consumes pages supplied by the local application boundary. It does not invent a model list. A refresh is complete only after the final page, revision, page continuity, and local installed/running reconciliation have succeeded. A failed refresh keeps the last verified cached state and marks it stale and offline. Tag reconciliation compares canonical `name:tag` references exactly.

Hardware fit is evidence-backed. It requires declared blob and memory metadata plus detected RAM and free disk, and returns `Runs well`, `Runs with limits`, `Unlikely`, or `Unknown`. A model name alone never produces a fit claim.

Pulls use an atomic durable state-store interface, an unlimited metadata queue, bounded worker concurrency, pause/resume/cancel, interrupted-run recovery, duplicate-tag suppression, retry of failed records, and partial outcomes. Chat validates roles and documented options, decodes attachment bytes, verifies image signatures and declared sizes, attaches vision images to the applicable user message, and preserves the streaming `Accept` header. Harness profiles must come from a reviewed product registry whose executable, arguments, working directory, and environment-key schema are exact; shell hosts are refused, split and joined secret arguments are redacted, environment values are filtered, and a failed health check terminates the process and restores the saved profile.

The application supplies real local hardware probes through `LocalHardwareDetector`; no model name is treated as hardware evidence. Desktop and hosted-site integration, UI wiring, and a live catalog refresh remain pending until the parent lane integrates this core.

Run the focused package checks with `npm test` from this directory. TypeScript validation is `npm run typecheck` when the workspace toolchain is available.
