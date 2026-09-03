# Preferences package

This package contains framework-neutral preference contracts and accessible React primitives for the desktop application. It keeps user choices local, validates private vocabulary files before caching, and keeps stable application identity separate from the display name.

## Surface contracts

- Language mode has English, Cantonese, and bilingual choices.
- English and Cantonese funny levels are independent, persisted, and bounded from 1 to 5. Dialog emoji decoration is a separate persisted switch.
- School mode is shared through a local storage record, propagates through a `BroadcastChannel` when available, forces English, and suppresses playful, vocabulary, and dim-sum capabilities while active.
- Narration uses runtime voice enumeration, stable voice identities, separate language pickers, rate and pitch controls, a serialized queue, and screen-reader/reduced-sound suppression.
- Schedules validate local time, dates, weekdays, cross-midnight windows, timezone, deterministic priority, and bounded local or HTTPS external sources with cancellation generations.
- Personal vocabulary is local-only, schema-versioned, bounded, duplicate-key aware, rejects unsafe keys, and clears back to original wording.
- Logo processing validates signatures and bounds before making a conversion plan. A persistence callback can roll back the previous valid logo if conversion or persistence fails.
- Export and bulk previews preserve complete records, redact sensitive fields, enumerate formats, and report exact exclusions.

External schedule refreshes require an injected privileged transport. The transport owns DNS resolution, redirect refusal, HTTPS and address policy, while the package adds a deadline, incremental response bound, schema validation, and generation cancellation. Home Assistant credentials are looked up by vault key inside the privileged boundary and are never returned by preference state.

School state is read from the shared local record at startup and refreshed through storage events and `BroadcastChannel`. Its credential reference is always removed from returned and persisted state. While it is active, language, funny-level, dialog-emoji, and vocabulary controls are omitted from the React surface rather than rendered as disabled controls.

Logo conversion has a decoder and encoder seam. Production code should provide the platform decoder, then use `decodeAndConvertLogo` to enforce decoded bounds and PNG output round-trip checks. Source names are transient only. Export redaction walks nested arrays and records, and narration debounces announcements while applying per-category cooldowns.

Run the focused tests with a TypeScript-aware test runner in the owning monorepo. The package has no runtime network requirement and does not include private vocabulary values or credentials.
