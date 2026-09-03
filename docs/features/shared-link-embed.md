# Shared-link embed

## Behavior

Published pages include server-rendered Open Graph title, description, URL, type, site name, image, dimensions, alt text, theme color, and a `summary_large_image` card declaration.

## Configuration

The social-preview source is committed at the repository root, and a published copy is generated from that source when a subdirectory host requires it. The two copies must be byte-identical.

## Failure and security

Absolute HTTPS image URLs and anonymous fetchability are required. No runtime JavaScript is needed by a crawler, and a changed graphic receives a changed URL to avoid stale cache behavior.

## Verification

Fetch served HTML and the image without credentials, confirm metadata and dimensions, and compare source and served bytes. The final hosted image is intentionally not claimed by this preview lane.

## Suggested articles

[App-logo customization](app-logo-customization.md), [Front-screen provenance](front-screen-provenance.md), [Offline documentation](offline-documentation.md).
