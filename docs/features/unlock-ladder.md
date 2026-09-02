# Unlock ladder

## Behavior

When authentication imposes a waiting period, the bounded ladder offers a dish choice, ten sums, whack-a-mole, and finally the original clock. School mode starts at sums, with dim sum omitted.

## Configuration

Challenges use server-generated single-use nonces, expiry, a fixed hourly budget, and the same underlying attempt escalation as the ordinary lockout.

## Failure and security

Winning clears waiting only. It never authenticates, changes credentials, creates a cookie, or refunds attempts. Early timed submissions, replayed nonces, duplicate mole hits, and client-side grading are rejected.

## Verification

Verify each rung, failure transition, budget exhaustion/refill, nonce expiry/replay, timing, School mode, keyboard, screen-reader score, and no-session-cookie assertion. Integrated evidence remains pending.

## Suggested articles

[Toy locks and authentication](toy-locks-authentication.md), [School mode](school-mode.md), [Dim sum surprise](dim-sum-surprise.md).
