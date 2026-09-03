# Local update state machine

This package owns the main-process update lifecycle for the Windows desktop application. It is deliberately independent of renderer code. The renderer receives a read-only UpdateState snapshot and can request named actions, but it never supplies a feed URL, package URL, executable path, or install command.

## Feed contract

The feed is bounded JSON with schemaVersion 1, a semantic version, an ISO-8601 updatedAt, an HTTPS release-notes URL, and one Windows package descriptor. The caller supplies an allowlist of hosts. URLs must use HTTPS, contain no credentials, use the default port or 443, and keep the package on the same host as the feed. Unknown fields, unsupported platforms, invalid versions, invalid hashes, and oversized values are refused.

fetchHttpsFeed rejects redirects and reads at most 256 KiB. downloadHttpsPackage rejects redirects and bounds the response at 2,000,000,000 bytes. The state machine checks the exact byte count and SHA-256 before calling UpdaterStore.stage.

## Lifecycle

startupCheck performs one bounded check. startSchedule runs checks on a bounded interval between five minutes and 24 hours. The state sequence distinguishes no update, available, downloading, paused, ready, deferred, offline, invalid feed, corrupt package, hash mismatch, rollback rejection, and other failures.

The ready banner is persistent and includes the exact version, release-notes URL, an unsigned update warning, and explicit restart-to-install and later actions. Restart is never automatic. restartToInstall refuses while unsaved work exists or when no restart callback is available.

## Verification

The focused tests cover semantic ordering, unsafe URL rejection, ready staging, size and hash failures, rollback refusal, deferred installation, unsaved-work protection, and a negative tamper regression. The caller should store only metadata and application-controlled staged bytes through UpdaterStore; no renderer-controlled path is accepted.
