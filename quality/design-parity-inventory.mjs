/**
 * Explicit design-reference parity inventory. A missing reference is visible
 * as a failure instead of disappearing through directory discovery.
 */

export const DESIGN_PARITY_INVENTORY = Object.freeze({
  schemaVersion: 1,
  captureMethod: "cheap-headless-built-artifact",
  tupleMatrix: {
    languages: ["en", "zh-Hant", "bilingual"],
    themes: ["light", "dark"],
    viewports: [{ width: 1280, height: 800 }, { width: 800, height: 600 }],
    scales: [1, 1.25, 1.5, 2],
    times: ["frozen"],
    motion: ["normal", "reduced"]
  },
  screens: Object.freeze([
    Object.freeze({
      id: "desktop_home_empty_light",
      referenceFile: "design/desktop-home-empty.html",
      referenceRoute: "reference://desktop/home?state=empty&theme=light&language=en&time=frozen&motion=reduced&width=1280&height=800&scale=1",
      realAppRoute: "app://claude-design/home?state=empty&theme=light&language=en&time=frozen&motion=reduced&width=1280&height=800&scale=1",
      state: "empty",
      theme: "light",
      language: "en",
      time: "frozen",
      motion: "reduced",
      viewport: { width: 1280, height: 800 },
      scale: 1,
      materialDesignAudit: "quality/design-audits/desktop_home_empty_light.json",
      rawReferenceCapture: "quality/design-captures/reference/desktop_home_empty_light.png",
      rawBuiltCapture: "quality/design-captures/built/desktop_home_empty_light.png",
      sideBySide: "quality/design-captures/compare/desktop_home_empty_light.png",
      visualDiff: "quality/design-captures/diff/desktop_home_empty_light.json",
      referenceCaptureSha256: "pending-reference-capture-hash",
      builtCaptureSha256: "pending-built-capture-hash",
      visualDiffSha256: "pending-visual-diff-hash",
      intentionalDeviation: null
    }),
    Object.freeze({
      id: "site_home_empty_dark_zhHant",
      referenceFile: "design/site-home-empty.html",
      referenceRoute: "reference://site/home?state=empty&theme=dark&language=zh-Hant&time=frozen&motion=normal&width=1280&height=800&scale=1",
      realAppRoute: "/?state=empty&theme=dark&language=zh-Hant&time=frozen&motion=normal&width=1280&height=800&scale=1",
      state: "empty",
      theme: "dark",
      language: "zh-Hant",
      time: "frozen",
      motion: "normal",
      viewport: { width: 1280, height: 800 },
      scale: 1,
      materialDesignAudit: "quality/design-audits/site_home_empty_dark_zhHant.json",
      rawReferenceCapture: "quality/design-captures/reference/site_home_empty_dark_zhHant.png",
      rawBuiltCapture: "quality/design-captures/built/site_home_empty_dark_zhHant.png",
      sideBySide: "quality/design-captures/compare/site_home_empty_dark_zhHant.png",
      visualDiff: "quality/design-captures/diff/site_home_empty_dark_zhHant.json",
      referenceCaptureSha256: "pending-reference-capture-hash",
      builtCaptureSha256: "pending-built-capture-hash",
      visualDiffSha256: "pending-visual-diff-hash",
      intentionalDeviation: null
    })
  ])
});

export const REQUIRED_PARITY_FIELDS = Object.freeze([
  "id",
  "referenceFile",
  "referenceRoute",
  "realAppRoute",
  "state",
  "theme",
  "language",
  "time",
  "motion",
  "viewport",
  "scale",
  "materialDesignAudit",
  "rawReferenceCapture",
  "rawBuiltCapture",
  "sideBySide",
  "visualDiff",
  "referenceCaptureSha256",
  "builtCaptureSha256",
  "visualDiffSha256",
  "intentionalDeviation"
]);
