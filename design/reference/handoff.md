# Reference implementation handoff

## Route decision

- Destination: `Ding-Ding-Projects/claude-design-desktop`
- Source baseline: commit `4a3c267e7e22f6636a02542554309cd49cd41e9d`
- Target framework: Electron with a sandboxed renderer and a preload-only window control bridge
- Product identity: Claude Design Desktop
- Supported design viewport: 1280 by 800, with a documented minimum of 960 by 700
- Required scale tuples: 1, 1.25, 1.5, and 2
- Required language tuples: English, Cantonese, and bilingual
- Required themes: light and dark
- Motion policy: frozen for reference captures

## Material Designer availability

The preferred Material Designer route was inspected first. Its reference app entry and inventory exist, but `design/apps/desktop/node_modules/electron/package.json` and `design/apps/desktop/node_modules/electron/dist/electron.exe` are absent. No MCP creation or export binding is available in this task environment. This is the exact blocker. The local route below is used instead.

## Asset provenance

The reference uses only checked-in CSS, HTML, JavaScript, and JSON. It has no CDN, remote font, remote image, analytics, or hosted shell dependency. The cards and diagrams are structural product references, not copied upstream application assets.

## Intentional deviations

The reference app uses data descriptors rather than an exported design-tool file because the preferred creation/export route was unavailable. This keeps the source reviewable and deterministic. The renderer is deliberately plain and is not a claim about the production renderer.

## Implementation destinations

| Reference | Production destination |
| --- | --- |
| `signin` | account sign-in and account picker flow |
| `accounts` | saved account slots and active-account management |
| `projects` | project list, creation, and access status |
| `editor` | design editor, file tree, chat, and preview |
| `sharing` | owner grants and role management |
| `settings` | language, appearance, accessibility, and account settings |
| `features` | universal feature hub and status |
| `downloads` | browser-download companion progress surface |
| `recovery` | error, retry, and recovery paths |
