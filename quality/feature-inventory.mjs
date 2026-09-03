/**
 * Hand-written completeness inventory for the desktop application and its site.
 *
 * The list is intentionally explicit. It must not be replaced by filesystem
 * discovery because a missing feature would then disappear from its own check.
 */

const ids = [
  "language_modes",
  "funny_levels",
  "emoji_toggle",
  "school_mode",
  "narration",
  "scheduled_external_settings",
  "dim_sum_surprise",
  "regex_builder",
  "notifications",
  "material_appearance",
  "tabs_groups_searches",
  "offline_documentation",
  "command_palette",
  "destructive_confirmation",
  "local_history",
  "changelog_viewer",
  "external_editor",
  "exports",
  "bulk_actions",
  "accessibility",
  "responsive_sizing",
  "personal_vocabulary",
  "toy_locks_support_tickets",
  "browser_extension_downloads",
  "unlock_ladder",
  "shared_link_embed",
  "adhd_modes",
  "app_logo_customization",
  "file_converter",
  "ollama_suite_manager"
];

const titles = {
  language_modes: "Language modes",
  funny_levels: "Independent language funny levels",
  emoji_toggle: "Dialog emoji toggle",
  school_mode: "School mode",
  narration: "Spoken event narrator",
  scheduled_external_settings: "Scheduled and external settings",
  dim_sum_surprise: "Dim sum startup surprise",
  regex_builder: "Advanced regular expression builder",
  notifications: "Notification centre",
  material_appearance: "Material Design appearance and element editor",
  tabs_groups_searches: "Tabbed navigation, groups, and searches",
  offline_documentation: "Landing page and offline documentation",
  command_palette: "Command palette",
  destructive_confirmation: "Destructive action super confirmation",
  local_history: "Local version history",
  changelog_viewer: "Changelog viewer",
  external_editor: "External editor handoff",
  exports: "Complete export formats",
  bulk_actions: "Bulk actions",
  accessibility: "Accessibility",
  responsive_sizing: "Responsive sizing",
  personal_vocabulary: "Personal vocabulary upload",
  toy_locks_support_tickets: "Toy locks and Support Tickets",
  browser_extension_downloads: "Browser extension download flow",
  unlock_ladder: "Unlock ladder",
  shared_link_embed: "Shared-link embed graphic",
  adhd_modes: "ADHD interface modes",
  app_logo_customization: "App logo customization",
  file_converter: "Local file converter",
  ollama_suite_manager: "Local Ollama suite manager"
};

const motionFeatures = new Set([
  "narration",
  "dim_sum_surprise",
  "notifications",
  "material_appearance",
  "destructive_confirmation",
  "browser_extension_downloads",
  "unlock_ladder",
  "adhd_modes",
  "app_logo_customization",
  "file_converter",
  "ollama_suite_manager"
]);

function pascalCase(id) {
  return id.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join("");
}

function surfaceRequirement(surface, id) {
  const pascal = pascalCase(id);
  const isDesktop = surface === "desktop";
  const sourceRoot = isDesktop ? "packages/electron/src" : "packages/site/src";
  const testRoot = isDesktop ? "packages/electron/test" : "packages/site/test";
  const docsRoot = isDesktop ? "docs/src/content/docs" : "docs/src/content/site";
  return {
    implementation: {
      path: `${sourceRoot}/features/${id}.ts`,
      symbol: `register${pascal}Feature`,
      registration: `registerFeature(\"${id}\")`
    },
    documentation: {
      article: `${docsRoot}/features/${id}.md`,
      heading: titles[id]
    },
    localization: {
      en: { path: `${sourceRoot}/locales/en/${id}.json`, key: `${id}.title` },
      zhHant: { path: `${sourceRoot}/locales/zh-Hant/${id}.json`, key: `${id}.title` },
      bilingual: { path: `${sourceRoot}/locales/bilingual/${id}.json`, key: `${id}.title` }
    },
    persistence: {
      path: `${sourceRoot}/state/${id}.ts`,
      key: id,
      resetAction: `reset_${id}`
    },
    focusedTest: {
      path: `${testRoot}/features/${id}.test.ts`,
      testName: `${id}: focused behavior`
    },
    builtInteraction: {
      receiptPath: `quality/receipts/${surface}/interaction/${id}.json`,
      route: isDesktop ? `app://claude-design/${id}` : `/features/${id}`,
      artifactSha256: "recorded-at-build-time",
      packageContent: `${isDesktop ? "packages/electron" : "packages/site"}/dist/${id}`
    },
    genuineCapture: {
      receiptPath: `quality/receipts/${surface}/captures/${id}.json`,
      capturePath: `quality/captures/${surface}/${id}.png`,
      commitSha: "recorded-at-capture-time",
      artifactSha256: "recorded-at-capture-time",
      viewport: { width: 1280, height: 800 },
      scale: 1,
      theme: "light"
    },
    recording: {
      required: motionFeatures.has(id),
      receiptPath: motionFeatures.has(id) ? `quality/receipts/${surface}/recordings/${id}.json` : null,
      path: motionFeatures.has(id) ? `quality/recordings/${surface}/${id}.webm` : null
    },
    dataBoundary: {
      statement: "The feature data stays local unless an explicitly documented external source is active.",
      assertedBy: `quality/receipts/${surface}/privacy/${id}.json`
    },
    availability: {
      supported: `quality/receipts/${surface}/availability/${id}-supported.json`,
      unavailable: `quality/receipts/${surface}/availability/${id}-unavailable.json`
    },
    negativeCase: {
      path: `quality/self-tests/${surface}/${id}.test.mjs`,
      testName: `${id}: missing contract row turns red`
    }
  };
}

export const FEATURE_IDS = Object.freeze([...ids]);

export const FEATURE_INVENTORY = Object.freeze({
  schemaVersion: 1,
  inventoryId: "claude-design-desktop-completeness",
  canonicalFeatureIds: FEATURE_IDS,
  versionProvenance: {
    versionPath: "packages/electron/package.json",
    updatedAtPath: "build/provenance.json",
    source: "the running build provenance record",
    timezoneRequired: true,
    secondsRequired: true,
    unavailableState: "unavailable when provenance is missing or invalid"
  },
  surfaces: {
    desktop: { kind: "desktop application", routePrefix: "app://claude-design/" },
    site: { kind: "documentation and landing site", routePrefix: "/" }
  },
  features: FEATURE_IDS.map((id) => Object.freeze({
    id,
    title: titles[id],
    motionApplies: motionFeatures.has(id),
    desktop: surfaceRequirement("desktop", id),
    site: surfaceRequirement("site", id)
  }))
});

export const REQUIRED_SURFACE_FIELDS = Object.freeze([
  "implementation",
  "documentation",
  "localization",
  "persistence",
  "focusedTest",
  "builtInteraction",
  "genuineCapture",
  "recording",
  "dataBoundary",
  "availability",
  "negativeCase"
]);
