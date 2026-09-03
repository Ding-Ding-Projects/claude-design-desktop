# Local update state machine

This package owns the main-process update lifecycle for the Windows desktop application. It is deliberately independent of renderer code. The renderer receives a read-only UpdateState snapshot and can request named actions, but it never supplies a feed URL, package URL, executable path, or install command.

## Feed contract

The feed is bounded JSON with schemaVersion 1, a semantic version, an ISO-8601 updatedAt, an HTTPS release-notes URL, and one Windows x64 package descriptor. The caller supplies an allowlist of hosts, and the transport resolves each host before connecting. Private, loopback, link-local, unavailable, or mixed unsafe DNS results are refused. URLs must use HTTPS, contain no credentials, use the default port or 443, and keep the package on the same host as the feed. Unknown fields, unsupported platforms, invalid versions, invalid hashes, and oversized values are refused.

fetchHttpsFeed rejects redirects, applies a deadline, and reads at most 256 KiB over a socket bound to the validated DNS result. downloadHttpsPackage rejects redirects, applies a deadline, streams the response, and bounds it at 2,000,000,000 bytes. AtomicUpdaterStore writes chunks to a unique temporary file, hashes as it writes, retries transient Windows rename errors, assigns an opaque handle-owned stage filename, and revalidates the staged file on restart. The state machine checks the exact byte count and SHA-256 before exposing ready.

## Lifecycle

startupCheck performs one bounded check. startSchedule runs checks on a bounded interval between five minutes and 24 hours. The state sequence distinguishes no update, available, downloading, paused, ready, deferred, offline, invalid feed, corrupt package, hash mismatch, rollback rejection, and other failures.

The ready banner is persistent and includes the exact version, release-notes URL, an unsigned update warning, and explicit restart-to-install and later actions. Restart is never automatic. restartToInstall refuses while unsaved work exists or when no restart callback is available.

Operation generations capture their AbortController, so an older check cannot overwrite a newer result and cancellation reaches staging before ready can be emitted. The Squirrel.Windows adapter accepts only newer unsigned win32/x64 packages and exposes a rollback plan without handing executable paths to the renderer.

## Verification

The focused tests cover semantic ordering, unsafe URL and DNS rejection, ready staging, size and same-size hash failures, rollback refusal, deferred installation, unsaved-work protection, overlap generations, cancel during staging, stalled or oversized streams, atomic rehydration, product binding, Squirrel handoff, and negative tamper regressions. The caller should store only metadata and application-controlled staged bytes through UpdaterStore; no renderer-controlled path is accepted.
