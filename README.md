# Claude Design Desktop

Claude Design Desktop is an unofficial local design workspace with a product-owned desktop shell, documented compatibility surfaces, and a responsive documentation site. It is not affiliated with Anthropic or OpenAI. The public landing site explains the product and links only to verified release assets; the installed application is the runtime.

## Start here

- [Documentation and feature catalog](site/index.html)
- [Feature article index](docs/README.md)
- [Roadmap](ROADMAP.md)
- [Handoff](HANDOFF.md)

This extraction records `4a3c267e7e22f6636a02542554309cd49cd41e9d` as the source baseline. The current site source is a preview and does not claim a published installer, release, or completed desktop integration.

## Site source

The `site/` folder is a dependency-free static source with local CSS and JavaScript. It provides responsive navigation, local visitor settings, a command palette on `<kbd>Ctrl+Shift+F</kbd>`, an anchored regex workbench for each search field, a feature catalog, status cards, provenance handling, and an honest unavailable download state. The static check is:

```text
node site/test-static.mjs
```

No CDN, analytics, remote font, or remote image is required by the source. The Open Graph image URL is a release-bound placeholder until a verified product capture is committed and published.

## Build and release status

The integrated desktop build, Squirrel.Windows installer, app-server runtime, migration flow, built-artifact captures, and public release remain unverified in this lane. A download button stays disabled until a release manifest proves an immutable asset URL, version, platform, and hash.

## Human effort estimate

This is an estimate, not a measured fact. The documentation/site slice is currently a small hand-written static surface; after the committed line counter and release provenance are available, this section must be refreshed from that table using the documented rate and exclusions. Dependencies, generated output, and build output are excluded from the estimate.

## License

This repository is MIT-licensed. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
