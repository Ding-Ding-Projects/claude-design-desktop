# Security policy

## Scope

Claude Design Desktop is intended to be a local Windows x64 desktop product. It connects the desktop shell to configured local gateway services and to the user-selected provider routes. It is not an official Anthropic product and is not affiliated with Anthropic, OpenAI, or the maintainers of any upstream service it can connect to.

The current extraction is not a published installer. Do not treat an unbuilt checkout, a development preview, or a source snapshot as a supported release.

## Security model

- Credentials and provider responses must stay out of logs, screenshots, crash reports, issue reports, and generated documentation.
- Local-only project and sharing data must remain local unless a user explicitly starts an operation that sends it to a configured endpoint.
- Network requests must use bounded timeouts, explicit allowlists, and response validation. Redirects, embedded credentials, and unbounded payloads are not acceptable defaults.
- The desktop shell must preserve the stable product identity when a user changes display preferences. A display label must never move the data directory, package identity, update feed, or executable identity.
- Packaged Windows installers are unsigned. Release notes must warn users that the operating system may show an unknown-publisher or SmartScreen warning. No signing key or certificate belongs in this project.

## Reporting a vulnerability

Please do not put credentials, exploit details, private project content, or personal data in a public issue. Use the repository's private security-reporting channel when one is enabled. If that channel is not available, open a minimal public issue containing only a short description and the affected version or commit, then ask maintainers for a private route. Remove secrets from local logs before sharing any diagnostic evidence.

Reports should include:

1. The affected commit, release, or build identifier.
2. The smallest reproducible description that does not disclose private data.
3. The expected and observed security boundaries.
4. Any safe mitigation that does not require bypassing access controls or rewriting history.
