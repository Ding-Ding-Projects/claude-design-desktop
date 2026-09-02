# Regex builders

## Behavior

Every search field has an adjacent anchored advanced regex builder. Plain text is the default. The builder explains the JavaScript engine and flags, validates patterns, reports matches and captures, previews replacements, and warns about zero-width and backtracking risk.

## Configuration

Each field owns isolated query, pattern, flags, validation, and saved-snippet state. Patterns are bounded and evaluated locally.

## Failure and security

Invalid patterns remain visible with the engine error. Evaluation is bounded to protect the page from resource exhaustion. Patterns and samples are not transmitted.

## Verification

Verify plain text, Unicode, multiline, captures, replacement, invalid syntax, zero-width matches, adversarial input, and every search surface. The public preview includes a working builder; final integrated evidence is pending.

## Suggested articles

[Command palette](command-palette.md), [Tabbed navigation](tabbed-navigation.md), [Bulk actions](bulk-actions.md).
