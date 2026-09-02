# Dialog emoji toggle

## Behavior

Dialogs and message boxes may show relevant decorative emoji when the user enables the toggle. Emoji never replace factual copy, action labels, field labels, or accessible names.

## Configuration

The toggle is persisted locally, localized in every language mode, and reset with visitor settings. The default is enabled for this preview surface.

## Failure and security

If the preference cannot be read, the surface uses the original text without emoji. No emoji preference is sent over the network.

## Verification

Test enabled and disabled rendering, reload persistence, keyboard access, reduced motion, and narrow bilingual layouts. Integrated built-artifact evidence is pending.

## Suggested articles

[Language modes](language-modes.md), [Notifications](notification-centre.md), [Accessibility and responsive sizing](accessibility-responsive-sizing.md).
