# School mode

## Behavior

School mode is a shared local presentation mode. While active it uses English and omits Cantonese, bilingual, funny-level, personal vocabulary, and dim sum controls from user-facing surfaces. The chosen name replaces the shipped label everywhere on the surface.

## Configuration

The mode name, enabled state, and unlock choice are stored in the shared local application data record. Changes are watched live, not only at startup.

## Failure and security

This is a user-experience lock, not a security boundary. Deleting the shared local record resets it. If the record cannot be watched, the control says so and does not pretend the mode is synchronized.

## Verification

Verify live propagation, suppression and restoration of controls, reset behavior, accessibility, and all pages. Final cross-app evidence is pending integration.

## Suggested articles

[Language modes](language-modes.md), [Toy locks and authentication](toy-locks-authentication.md), [Unlock ladder](unlock-ladder.md).
