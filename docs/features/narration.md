# Narration

## Behavior

Optional local text-to-speech can narrate product events in English, Cantonese, or both. Bilingual narration speaks English first and Cantonese second through a serialized queue.

## Configuration

Narration is off by default. English and Cantonese voice pickers enumerate runtime voices, offer automatic selection, persist stable voice identities, and expose rate and pitch controls.

## Failure and security

Late or empty voice enumeration is handled by a subscription and refresh. Missing, uninstalled, or network-backed voices are described honestly and fall back without resetting the saved choice. No speech text or voice credential leaves the local boundary.

## Verification

Test queue replacement, cooldowns, screen-reader yielding, reduced sound, voice changes, unavailable voices, bounds, restart persistence, and all language modes. Built evidence is pending.

## Suggested articles

[Language modes](language-modes.md), [Scheduled settings](scheduled-settings.md), [Accessibility and responsive sizing](accessibility-responsive-sizing.md).
