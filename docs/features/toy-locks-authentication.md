# Toy locks and authentication

## Behavior

Every rendered element can opt into its own PIN, password, or TOTP combination through an anchored wizard. A locked element is disabled but remains an unlock target and never executes its protected action.

## Configuration

Each lock owns its credential policy, credential set, unlock duration, and history record. PIN entry has keypad and manual paths with one validator and one attempt budget.

## Failure and security

These locks are a user-experience speed bump, not security or encryption. Credentials live only in the platform vault. Recovery is deleting the app's local data folder, and the exact route is shown in the wizard and prompt.

## Verification

Verify all six policies, factors, keypad/manual parity, alternate shortcuts, command palette resistance, expiry, relock, recovery, lock search, localization, and no secret leakage. Final built evidence is pending.

## Suggested articles

[Unlock ladder](unlock-ladder.md), [Destructive confirmation](destructive-confirmation.md), [Local history](local-history.md).
