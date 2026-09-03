/**
 * Explicit design-reference parity inventory. A missing reference is visible
 * as a failure instead of disappearing through directory discovery.
 */

export const DESIGN_PARITY_INVENTORY = Object.freeze({
  schemaVersion: 1,
  captureMethod: "cheap-headless-built-artifact",
  screens: Object.freeze([
    Object.freeze({
      id: "desktop_home_empty_light",
      referenceFile: "design/desktop-home-empty.html",
      referenceRoute: "reference://desktop/home?state=empty&theme=light&width=1280&height=800&scale=1",
      realAppRoute: "app://claude-design/home?state=empty&theme=light&width=1280&height=800&scale=1",
      state: "empty",
      theme: "light",
      viewport: { width: 1280, height: 800 },
      scale: 1,
      materialDesignAudit: "quality/design-audits/desktop_home_empty_light.json",
      rawReferenceCapture: "quality/design-captures/reference/desktop_home_empty_light.png",
      rawBuiltCapture: "quality/design-captures/built/desktop_home_empty_light.png",
      sideBySide: "quality/design-captures/compare/desktop_home_empty_light.png",
      visualDiff: "quality/design-captures/diff/desktop_home_empty_light.json",
      intentionalDeviation: null
    }),
    Object.freeze({
      id: "site_home_empty_light",
      referenceFile: "design/site-home-empty.html",
      referenceRoute: "reference://site/home?state=empty&theme=light&width=1280&height=800&scale=1",
      realAppRoute: "/?state=empty&theme=light&width=1280&height=800&scale=1",
      state: "empty",
      theme: "light",
      viewport: { width: 1280, height: 800 },
      scale: 1,
      materialDesignAudit: "quality/design-audits/site_home_empty_light.json",
      rawReferenceCapture: "quality/design-captures/reference/site_home_empty_light.png",
      rawBuiltCapture: "quality/design-captures/built/site_home_empty_light.png",
      sideBySide: "quality/design-captures/compare/site_home_empty_light.png",
      visualDiff: "quality/design-captures/diff/site_home_empty_light.json",
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
  "viewport",
  "scale",
  "materialDesignAudit",
  "rawReferenceCapture",
  "rawBuiltCapture",
  "sideBySide",
  "visualDiff",
  "intentionalDeviation"
]);
