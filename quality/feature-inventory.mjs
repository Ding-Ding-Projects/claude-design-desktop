/**
 * Literal completeness inventory for both user-facing surfaces.
 *
 * The rows are deliberately written out in the checked-in module. Do not replace
 * them with directory discovery or a generated list, because absence must fail.
 */

export const FEATURE_IDS = Object.freeze([
  "language-modes",
  "dialog-emoji-toggle",
  "school-mode",
  "narration",
  "scheduled-settings",
  "dim-sum-surprise",
  "regex-builders",
  "notification-centre",
  "appearance-editors",
  "tabbed-navigation",
  "offline-documentation",
  "command-palette",
  "destructive-confirmation",
  "local-history",
  "changelog-viewer",
  "external-editor",
  "exports",
  "bulk-actions",
  "accessibility-responsive-sizing",
  "personal-vocabulary-upload",
  "toy-locks-authentication",
  "unlock-ladder",
  "shared-link-embed",
  "adhd-modes",
  "browser-download-surfaces",
  "app-logo-customization",
  "file-converter",
  "ollama-suite-manager",
  "status-hub",
  "front-screen-provenance"
]);

export const FEATURE_INVENTORY = Object.freeze({
  "schemaVersion": 1,
  "inventoryId": "claude-design-desktop-completeness",
  "canonicalFeatureIds": [
    "language-modes",
    "dialog-emoji-toggle",
    "school-mode",
    "narration",
    "scheduled-settings",
    "dim-sum-surprise",
    "regex-builders",
    "notification-centre",
    "appearance-editors",
    "tabbed-navigation",
    "offline-documentation",
    "command-palette",
    "destructive-confirmation",
    "local-history",
    "changelog-viewer",
    "external-editor",
    "exports",
    "bulk-actions",
    "accessibility-responsive-sizing",
    "personal-vocabulary-upload",
    "toy-locks-authentication",
    "unlock-ladder",
    "shared-link-embed",
    "adhd-modes",
    "browser-download-surfaces",
    "app-logo-customization",
    "file-converter",
    "ollama-suite-manager",
    "status-hub",
    "front-screen-provenance"
  ],
  "versionProvenance": {
    "versionPath": "packages/electron/package.json",
    "updatedAtPath": "build/provenance.json",
    "receiptPath": "quality/receipts/version-provenance.json",
    "source": "the build provenance record bound to the running package",
    "timezoneRequired": true,
    "secondsRequired": true,
    "unavailableState": "unavailable when provenance is missing or invalid",
    "requiredFields": [
      "version",
      "updatedAt",
      "timezone",
      "sourceSha256",
      "packageSha256"
    ]
  },
  "surfaces": {
    "desktop": {
      "kind": "desktop application",
      "routePrefix": "app://claude-design/"
    },
    "site": {
      "kind": "documentation and landing site",
      "routePrefix": "/"
    }
  },
  "receiptRequirements": {
    "builtInteraction": [
      "sourceSha256",
      "packageSha256",
      "route",
      "viewport",
      "scale",
      "theme",
      "privacyVerdict"
    ],
    "genuineCapture": [
      "sourceSha256",
      "packageSha256",
      "route",
      "viewport",
      "scale",
      "theme",
      "captureSha256",
      "privacyVerdict"
    ],
    "recording": [
      "sourceSha256",
      "packageSha256",
      "recordingSha256",
      "durationSeconds",
      "frameRate",
      "viewport",
      "privacyVerdict"
    ]
  },
  "features": [
    {
      "id": "language-modes",
      "title": "Language modes",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/language-modes.ts",
          "symbol": "registerLanguageModesFeature",
          "registration": "registerFeature(\"language-modes\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/language-modes.md",
          "heading": "Language modes"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/language-modes.json",
            "key": "language-modes.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/language-modes.json",
            "key": "language-modes.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/language-modes.json",
            "key": "language-modes.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/language-modes.ts",
          "key": "language-modes",
          "resetAction": "reset-language-modes"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/language-modes.test.ts",
          "testName": "language-modes focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/language-modes.json",
          "route": "app://claude-design/language-modes?state=empty",
          "packageContent": "packages/electron/dist/language-modes"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/language-modes.json",
          "capturePath": "quality/captures/desktop/language-modes.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/language-modes.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/language-modes-supported.json",
          "unavailable": "quality/receipts/desktop/availability/language-modes-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/language-modes.test.mjs",
          "testName": "language-modes missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/language-modes.ts",
          "symbol": "registerLanguageModesFeature",
          "registration": "registerFeature(\"language-modes\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/language-modes.md",
          "heading": "Language modes"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/language-modes.json",
            "key": "language-modes.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/language-modes.json",
            "key": "language-modes.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/language-modes.json",
            "key": "language-modes.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/language-modes.ts",
          "key": "language-modes",
          "resetAction": "reset-language-modes"
        },
        "focusedTest": {
          "path": "packages/site/test/features/language-modes.test.ts",
          "testName": "language-modes focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/language-modes.json",
          "route": "/features/language-modes?state=empty",
          "packageContent": "packages/site/dist/language-modes"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/language-modes.json",
          "capturePath": "quality/captures/site/language-modes.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/language-modes.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/language-modes-supported.json",
          "unavailable": "quality/receipts/site/availability/language-modes-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/language-modes.test.mjs",
          "testName": "language-modes missing contract turns red"
        }
      }
    },
    {
      "id": "dialog-emoji-toggle",
      "title": "Dialog emoji toggle",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/dialog-emoji-toggle.ts",
          "symbol": "registerDialogEmojiToggleFeature",
          "registration": "registerFeature(\"dialog-emoji-toggle\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/dialog-emoji-toggle.md",
          "heading": "Dialog emoji toggle"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/dialog-emoji-toggle.json",
            "key": "dialog-emoji-toggle.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/dialog-emoji-toggle.json",
            "key": "dialog-emoji-toggle.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/dialog-emoji-toggle.json",
            "key": "dialog-emoji-toggle.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/dialog-emoji-toggle.ts",
          "key": "dialog-emoji-toggle",
          "resetAction": "reset-dialog-emoji-toggle"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/dialog-emoji-toggle.test.ts",
          "testName": "dialog-emoji-toggle focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/dialog-emoji-toggle.json",
          "route": "app://claude-design/dialog-emoji-toggle?state=empty",
          "packageContent": "packages/electron/dist/dialog-emoji-toggle"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/dialog-emoji-toggle.json",
          "capturePath": "quality/captures/desktop/dialog-emoji-toggle.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/dialog-emoji-toggle.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/dialog-emoji-toggle-supported.json",
          "unavailable": "quality/receipts/desktop/availability/dialog-emoji-toggle-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/dialog-emoji-toggle.test.mjs",
          "testName": "dialog-emoji-toggle missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/dialog-emoji-toggle.ts",
          "symbol": "registerDialogEmojiToggleFeature",
          "registration": "registerFeature(\"dialog-emoji-toggle\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/dialog-emoji-toggle.md",
          "heading": "Dialog emoji toggle"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/dialog-emoji-toggle.json",
            "key": "dialog-emoji-toggle.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/dialog-emoji-toggle.json",
            "key": "dialog-emoji-toggle.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/dialog-emoji-toggle.json",
            "key": "dialog-emoji-toggle.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/dialog-emoji-toggle.ts",
          "key": "dialog-emoji-toggle",
          "resetAction": "reset-dialog-emoji-toggle"
        },
        "focusedTest": {
          "path": "packages/site/test/features/dialog-emoji-toggle.test.ts",
          "testName": "dialog-emoji-toggle focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/dialog-emoji-toggle.json",
          "route": "/features/dialog-emoji-toggle?state=empty",
          "packageContent": "packages/site/dist/dialog-emoji-toggle"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/dialog-emoji-toggle.json",
          "capturePath": "quality/captures/site/dialog-emoji-toggle.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/dialog-emoji-toggle.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/dialog-emoji-toggle-supported.json",
          "unavailable": "quality/receipts/site/availability/dialog-emoji-toggle-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/dialog-emoji-toggle.test.mjs",
          "testName": "dialog-emoji-toggle missing contract turns red"
        }
      }
    },
    {
      "id": "school-mode",
      "title": "School mode",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/school-mode.ts",
          "symbol": "registerSchoolModeFeature",
          "registration": "registerFeature(\"school-mode\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/school-mode.md",
          "heading": "School mode"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/school-mode.json",
            "key": "school-mode.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/school-mode.json",
            "key": "school-mode.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/school-mode.json",
            "key": "school-mode.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/school-mode.ts",
          "key": "school-mode",
          "resetAction": "reset-school-mode"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/school-mode.test.ts",
          "testName": "school-mode focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/school-mode.json",
          "route": "app://claude-design/school-mode?state=empty",
          "packageContent": "packages/electron/dist/school-mode"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/school-mode.json",
          "capturePath": "quality/captures/desktop/school-mode.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/school-mode.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/school-mode-supported.json",
          "unavailable": "quality/receipts/desktop/availability/school-mode-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/school-mode.test.mjs",
          "testName": "school-mode missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/school-mode.ts",
          "symbol": "registerSchoolModeFeature",
          "registration": "registerFeature(\"school-mode\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/school-mode.md",
          "heading": "School mode"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/school-mode.json",
            "key": "school-mode.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/school-mode.json",
            "key": "school-mode.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/school-mode.json",
            "key": "school-mode.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/school-mode.ts",
          "key": "school-mode",
          "resetAction": "reset-school-mode"
        },
        "focusedTest": {
          "path": "packages/site/test/features/school-mode.test.ts",
          "testName": "school-mode focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/school-mode.json",
          "route": "/features/school-mode?state=empty",
          "packageContent": "packages/site/dist/school-mode"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/school-mode.json",
          "capturePath": "quality/captures/site/school-mode.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/school-mode.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/school-mode-supported.json",
          "unavailable": "quality/receipts/site/availability/school-mode-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/school-mode.test.mjs",
          "testName": "school-mode missing contract turns red"
        }
      }
    },
    {
      "id": "narration",
      "title": "Spoken event narrator",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/narration.ts",
          "symbol": "registerNarrationFeature",
          "registration": "registerFeature(\"narration\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/narration.md",
          "heading": "Spoken event narrator"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/narration.json",
            "key": "narration.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/narration.json",
            "key": "narration.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/narration.json",
            "key": "narration.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/narration.ts",
          "key": "narration",
          "resetAction": "reset-narration"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/narration.test.ts",
          "testName": "narration focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/narration.json",
          "route": "app://claude-design/narration?state=empty",
          "packageContent": "packages/electron/dist/narration"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/narration.json",
          "capturePath": "quality/captures/desktop/narration.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/narration.json",
          "path": "quality/recordings/desktop/narration.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/narration.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/narration-supported.json",
          "unavailable": "quality/receipts/desktop/availability/narration-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/narration.test.mjs",
          "testName": "narration missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/narration.ts",
          "symbol": "registerNarrationFeature",
          "registration": "registerFeature(\"narration\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/narration.md",
          "heading": "Spoken event narrator"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/narration.json",
            "key": "narration.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/narration.json",
            "key": "narration.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/narration.json",
            "key": "narration.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/narration.ts",
          "key": "narration",
          "resetAction": "reset-narration"
        },
        "focusedTest": {
          "path": "packages/site/test/features/narration.test.ts",
          "testName": "narration focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/narration.json",
          "route": "/features/narration?state=empty",
          "packageContent": "packages/site/dist/narration"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/narration.json",
          "capturePath": "quality/captures/site/narration.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/narration.json",
          "path": "quality/recordings/site/narration.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/narration.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/narration-supported.json",
          "unavailable": "quality/receipts/site/availability/narration-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/narration.test.mjs",
          "testName": "narration missing contract turns red"
        }
      }
    },
    {
      "id": "scheduled-settings",
      "title": "Scheduled and external settings",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/scheduled-settings.ts",
          "symbol": "registerScheduledSettingsFeature",
          "registration": "registerFeature(\"scheduled-settings\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/scheduled-settings.md",
          "heading": "Scheduled and external settings"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/scheduled-settings.json",
            "key": "scheduled-settings.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/scheduled-settings.json",
            "key": "scheduled-settings.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/scheduled-settings.json",
            "key": "scheduled-settings.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/scheduled-settings.ts",
          "key": "scheduled-settings",
          "resetAction": "reset-scheduled-settings"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/scheduled-settings.test.ts",
          "testName": "scheduled-settings focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/scheduled-settings.json",
          "route": "app://claude-design/scheduled-settings?state=empty",
          "packageContent": "packages/electron/dist/scheduled-settings"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/scheduled-settings.json",
          "capturePath": "quality/captures/desktop/scheduled-settings.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/scheduled-settings.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/scheduled-settings-supported.json",
          "unavailable": "quality/receipts/desktop/availability/scheduled-settings-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/scheduled-settings.test.mjs",
          "testName": "scheduled-settings missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/scheduled-settings.ts",
          "symbol": "registerScheduledSettingsFeature",
          "registration": "registerFeature(\"scheduled-settings\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/scheduled-settings.md",
          "heading": "Scheduled and external settings"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/scheduled-settings.json",
            "key": "scheduled-settings.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/scheduled-settings.json",
            "key": "scheduled-settings.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/scheduled-settings.json",
            "key": "scheduled-settings.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/scheduled-settings.ts",
          "key": "scheduled-settings",
          "resetAction": "reset-scheduled-settings"
        },
        "focusedTest": {
          "path": "packages/site/test/features/scheduled-settings.test.ts",
          "testName": "scheduled-settings focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/scheduled-settings.json",
          "route": "/features/scheduled-settings?state=empty",
          "packageContent": "packages/site/dist/scheduled-settings"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/scheduled-settings.json",
          "capturePath": "quality/captures/site/scheduled-settings.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/scheduled-settings.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/scheduled-settings-supported.json",
          "unavailable": "quality/receipts/site/availability/scheduled-settings-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/scheduled-settings.test.mjs",
          "testName": "scheduled-settings missing contract turns red"
        }
      }
    },
    {
      "id": "dim-sum-surprise",
      "title": "Dim sum startup surprise",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/dim-sum-surprise.ts",
          "symbol": "registerDimSumSurpriseFeature",
          "registration": "registerFeature(\"dim-sum-surprise\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/dim-sum-surprise.md",
          "heading": "Dim sum startup surprise"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/dim-sum-surprise.json",
            "key": "dim-sum-surprise.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/dim-sum-surprise.json",
            "key": "dim-sum-surprise.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/dim-sum-surprise.json",
            "key": "dim-sum-surprise.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/dim-sum-surprise.ts",
          "key": "dim-sum-surprise",
          "resetAction": "reset-dim-sum-surprise"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/dim-sum-surprise.test.ts",
          "testName": "dim-sum-surprise focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/dim-sum-surprise.json",
          "route": "app://claude-design/dim-sum-surprise?state=empty",
          "packageContent": "packages/electron/dist/dim-sum-surprise"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/dim-sum-surprise.json",
          "capturePath": "quality/captures/desktop/dim-sum-surprise.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/dim-sum-surprise.json",
          "path": "quality/recordings/desktop/dim-sum-surprise.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/dim-sum-surprise.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/dim-sum-surprise-supported.json",
          "unavailable": "quality/receipts/desktop/availability/dim-sum-surprise-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/dim-sum-surprise.test.mjs",
          "testName": "dim-sum-surprise missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/dim-sum-surprise.ts",
          "symbol": "registerDimSumSurpriseFeature",
          "registration": "registerFeature(\"dim-sum-surprise\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/dim-sum-surprise.md",
          "heading": "Dim sum startup surprise"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/dim-sum-surprise.json",
            "key": "dim-sum-surprise.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/dim-sum-surprise.json",
            "key": "dim-sum-surprise.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/dim-sum-surprise.json",
            "key": "dim-sum-surprise.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/dim-sum-surprise.ts",
          "key": "dim-sum-surprise",
          "resetAction": "reset-dim-sum-surprise"
        },
        "focusedTest": {
          "path": "packages/site/test/features/dim-sum-surprise.test.ts",
          "testName": "dim-sum-surprise focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/dim-sum-surprise.json",
          "route": "/features/dim-sum-surprise?state=empty",
          "packageContent": "packages/site/dist/dim-sum-surprise"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/dim-sum-surprise.json",
          "capturePath": "quality/captures/site/dim-sum-surprise.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/dim-sum-surprise.json",
          "path": "quality/recordings/site/dim-sum-surprise.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/dim-sum-surprise.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/dim-sum-surprise-supported.json",
          "unavailable": "quality/receipts/site/availability/dim-sum-surprise-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/dim-sum-surprise.test.mjs",
          "testName": "dim-sum-surprise missing contract turns red"
        }
      }
    },
    {
      "id": "regex-builders",
      "title": "Advanced regular expression builder",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/regex-builders.ts",
          "symbol": "registerRegexBuildersFeature",
          "registration": "registerFeature(\"regex-builders\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/regex-builders.md",
          "heading": "Advanced regular expression builder"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/regex-builders.json",
            "key": "regex-builders.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/regex-builders.json",
            "key": "regex-builders.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/regex-builders.json",
            "key": "regex-builders.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/regex-builders.ts",
          "key": "regex-builders",
          "resetAction": "reset-regex-builders"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/regex-builders.test.ts",
          "testName": "regex-builders focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/regex-builders.json",
          "route": "app://claude-design/regex-builders?state=empty",
          "packageContent": "packages/electron/dist/regex-builders"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/regex-builders.json",
          "capturePath": "quality/captures/desktop/regex-builders.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/regex-builders.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/regex-builders-supported.json",
          "unavailable": "quality/receipts/desktop/availability/regex-builders-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/regex-builders.test.mjs",
          "testName": "regex-builders missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/regex-builders.ts",
          "symbol": "registerRegexBuildersFeature",
          "registration": "registerFeature(\"regex-builders\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/regex-builders.md",
          "heading": "Advanced regular expression builder"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/regex-builders.json",
            "key": "regex-builders.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/regex-builders.json",
            "key": "regex-builders.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/regex-builders.json",
            "key": "regex-builders.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/regex-builders.ts",
          "key": "regex-builders",
          "resetAction": "reset-regex-builders"
        },
        "focusedTest": {
          "path": "packages/site/test/features/regex-builders.test.ts",
          "testName": "regex-builders focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/regex-builders.json",
          "route": "/features/regex-builders?state=empty",
          "packageContent": "packages/site/dist/regex-builders"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/regex-builders.json",
          "capturePath": "quality/captures/site/regex-builders.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/regex-builders.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/regex-builders-supported.json",
          "unavailable": "quality/receipts/site/availability/regex-builders-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/regex-builders.test.mjs",
          "testName": "regex-builders missing contract turns red"
        }
      }
    },
    {
      "id": "notification-centre",
      "title": "Notification centre",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/notification-centre.ts",
          "symbol": "registerNotificationCentreFeature",
          "registration": "registerFeature(\"notification-centre\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/notification-centre.md",
          "heading": "Notification centre"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/notification-centre.json",
            "key": "notification-centre.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/notification-centre.json",
            "key": "notification-centre.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/notification-centre.json",
            "key": "notification-centre.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/notification-centre.ts",
          "key": "notification-centre",
          "resetAction": "reset-notification-centre"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/notification-centre.test.ts",
          "testName": "notification-centre focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/notification-centre.json",
          "route": "app://claude-design/notification-centre?state=empty",
          "packageContent": "packages/electron/dist/notification-centre"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/notification-centre.json",
          "capturePath": "quality/captures/desktop/notification-centre.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/notification-centre.json",
          "path": "quality/recordings/desktop/notification-centre.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/notification-centre.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/notification-centre-supported.json",
          "unavailable": "quality/receipts/desktop/availability/notification-centre-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/notification-centre.test.mjs",
          "testName": "notification-centre missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/notification-centre.ts",
          "symbol": "registerNotificationCentreFeature",
          "registration": "registerFeature(\"notification-centre\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/notification-centre.md",
          "heading": "Notification centre"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/notification-centre.json",
            "key": "notification-centre.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/notification-centre.json",
            "key": "notification-centre.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/notification-centre.json",
            "key": "notification-centre.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/notification-centre.ts",
          "key": "notification-centre",
          "resetAction": "reset-notification-centre"
        },
        "focusedTest": {
          "path": "packages/site/test/features/notification-centre.test.ts",
          "testName": "notification-centre focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/notification-centre.json",
          "route": "/features/notification-centre?state=empty",
          "packageContent": "packages/site/dist/notification-centre"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/notification-centre.json",
          "capturePath": "quality/captures/site/notification-centre.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/notification-centre.json",
          "path": "quality/recordings/site/notification-centre.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/notification-centre.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/notification-centre-supported.json",
          "unavailable": "quality/receipts/site/availability/notification-centre-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/notification-centre.test.mjs",
          "testName": "notification-centre missing contract turns red"
        }
      }
    },
    {
      "id": "appearance-editors",
      "title": "Material Design appearance and element editor",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/appearance-editors.ts",
          "symbol": "registerAppearanceEditorsFeature",
          "registration": "registerFeature(\"appearance-editors\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/appearance-editors.md",
          "heading": "Material Design appearance and element editor"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/appearance-editors.json",
            "key": "appearance-editors.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/appearance-editors.json",
            "key": "appearance-editors.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/appearance-editors.json",
            "key": "appearance-editors.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/appearance-editors.ts",
          "key": "appearance-editors",
          "resetAction": "reset-appearance-editors"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/appearance-editors.test.ts",
          "testName": "appearance-editors focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/appearance-editors.json",
          "route": "app://claude-design/appearance-editors?state=empty",
          "packageContent": "packages/electron/dist/appearance-editors"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/appearance-editors.json",
          "capturePath": "quality/captures/desktop/appearance-editors.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/appearance-editors.json",
          "path": "quality/recordings/desktop/appearance-editors.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/appearance-editors.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/appearance-editors-supported.json",
          "unavailable": "quality/receipts/desktop/availability/appearance-editors-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/appearance-editors.test.mjs",
          "testName": "appearance-editors missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/appearance-editors.ts",
          "symbol": "registerAppearanceEditorsFeature",
          "registration": "registerFeature(\"appearance-editors\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/appearance-editors.md",
          "heading": "Material Design appearance and element editor"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/appearance-editors.json",
            "key": "appearance-editors.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/appearance-editors.json",
            "key": "appearance-editors.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/appearance-editors.json",
            "key": "appearance-editors.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/appearance-editors.ts",
          "key": "appearance-editors",
          "resetAction": "reset-appearance-editors"
        },
        "focusedTest": {
          "path": "packages/site/test/features/appearance-editors.test.ts",
          "testName": "appearance-editors focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/appearance-editors.json",
          "route": "/features/appearance-editors?state=empty",
          "packageContent": "packages/site/dist/appearance-editors"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/appearance-editors.json",
          "capturePath": "quality/captures/site/appearance-editors.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/appearance-editors.json",
          "path": "quality/recordings/site/appearance-editors.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/appearance-editors.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/appearance-editors-supported.json",
          "unavailable": "quality/receipts/site/availability/appearance-editors-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/appearance-editors.test.mjs",
          "testName": "appearance-editors missing contract turns red"
        }
      }
    },
    {
      "id": "tabbed-navigation",
      "title": "Tabbed navigation, groups, and searches",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/tabbed-navigation.ts",
          "symbol": "registerTabbedNavigationFeature",
          "registration": "registerFeature(\"tabbed-navigation\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/tabbed-navigation.md",
          "heading": "Tabbed navigation, groups, and searches"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/tabbed-navigation.json",
            "key": "tabbed-navigation.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/tabbed-navigation.json",
            "key": "tabbed-navigation.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/tabbed-navigation.json",
            "key": "tabbed-navigation.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/tabbed-navigation.ts",
          "key": "tabbed-navigation",
          "resetAction": "reset-tabbed-navigation"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/tabbed-navigation.test.ts",
          "testName": "tabbed-navigation focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/tabbed-navigation.json",
          "route": "app://claude-design/tabbed-navigation?state=empty",
          "packageContent": "packages/electron/dist/tabbed-navigation"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/tabbed-navigation.json",
          "capturePath": "quality/captures/desktop/tabbed-navigation.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/tabbed-navigation.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/tabbed-navigation-supported.json",
          "unavailable": "quality/receipts/desktop/availability/tabbed-navigation-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/tabbed-navigation.test.mjs",
          "testName": "tabbed-navigation missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/tabbed-navigation.ts",
          "symbol": "registerTabbedNavigationFeature",
          "registration": "registerFeature(\"tabbed-navigation\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/tabbed-navigation.md",
          "heading": "Tabbed navigation, groups, and searches"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/tabbed-navigation.json",
            "key": "tabbed-navigation.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/tabbed-navigation.json",
            "key": "tabbed-navigation.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/tabbed-navigation.json",
            "key": "tabbed-navigation.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/tabbed-navigation.ts",
          "key": "tabbed-navigation",
          "resetAction": "reset-tabbed-navigation"
        },
        "focusedTest": {
          "path": "packages/site/test/features/tabbed-navigation.test.ts",
          "testName": "tabbed-navigation focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/tabbed-navigation.json",
          "route": "/features/tabbed-navigation?state=empty",
          "packageContent": "packages/site/dist/tabbed-navigation"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/tabbed-navigation.json",
          "capturePath": "quality/captures/site/tabbed-navigation.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/tabbed-navigation.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/tabbed-navigation-supported.json",
          "unavailable": "quality/receipts/site/availability/tabbed-navigation-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/tabbed-navigation.test.mjs",
          "testName": "tabbed-navigation missing contract turns red"
        }
      }
    },
    {
      "id": "offline-documentation",
      "title": "Landing page and offline documentation",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/offline-documentation.ts",
          "symbol": "registerOfflineDocumentationFeature",
          "registration": "registerFeature(\"offline-documentation\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/offline-documentation.md",
          "heading": "Landing page and offline documentation"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/offline-documentation.json",
            "key": "offline-documentation.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/offline-documentation.json",
            "key": "offline-documentation.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/offline-documentation.json",
            "key": "offline-documentation.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/offline-documentation.ts",
          "key": "offline-documentation",
          "resetAction": "reset-offline-documentation"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/offline-documentation.test.ts",
          "testName": "offline-documentation focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/offline-documentation.json",
          "route": "app://claude-design/offline-documentation?state=empty",
          "packageContent": "packages/electron/dist/offline-documentation"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/offline-documentation.json",
          "capturePath": "quality/captures/desktop/offline-documentation.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/offline-documentation.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/offline-documentation-supported.json",
          "unavailable": "quality/receipts/desktop/availability/offline-documentation-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/offline-documentation.test.mjs",
          "testName": "offline-documentation missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/offline-documentation.ts",
          "symbol": "registerOfflineDocumentationFeature",
          "registration": "registerFeature(\"offline-documentation\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/offline-documentation.md",
          "heading": "Landing page and offline documentation"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/offline-documentation.json",
            "key": "offline-documentation.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/offline-documentation.json",
            "key": "offline-documentation.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/offline-documentation.json",
            "key": "offline-documentation.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/offline-documentation.ts",
          "key": "offline-documentation",
          "resetAction": "reset-offline-documentation"
        },
        "focusedTest": {
          "path": "packages/site/test/features/offline-documentation.test.ts",
          "testName": "offline-documentation focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/offline-documentation.json",
          "route": "/features/offline-documentation?state=empty",
          "packageContent": "packages/site/dist/offline-documentation"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/offline-documentation.json",
          "capturePath": "quality/captures/site/offline-documentation.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/offline-documentation.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/offline-documentation-supported.json",
          "unavailable": "quality/receipts/site/availability/offline-documentation-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/offline-documentation.test.mjs",
          "testName": "offline-documentation missing contract turns red"
        }
      }
    },
    {
      "id": "command-palette",
      "title": "Command palette",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/command-palette.ts",
          "symbol": "registerCommandPaletteFeature",
          "registration": "registerFeature(\"command-palette\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/command-palette.md",
          "heading": "Command palette"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/command-palette.json",
            "key": "command-palette.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/command-palette.json",
            "key": "command-palette.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/command-palette.json",
            "key": "command-palette.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/command-palette.ts",
          "key": "command-palette",
          "resetAction": "reset-command-palette"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/command-palette.test.ts",
          "testName": "command-palette focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/command-palette.json",
          "route": "app://claude-design/command-palette?state=empty",
          "packageContent": "packages/electron/dist/command-palette"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/command-palette.json",
          "capturePath": "quality/captures/desktop/command-palette.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/command-palette.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/command-palette-supported.json",
          "unavailable": "quality/receipts/desktop/availability/command-palette-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/command-palette.test.mjs",
          "testName": "command-palette missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/command-palette.ts",
          "symbol": "registerCommandPaletteFeature",
          "registration": "registerFeature(\"command-palette\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/command-palette.md",
          "heading": "Command palette"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/command-palette.json",
            "key": "command-palette.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/command-palette.json",
            "key": "command-palette.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/command-palette.json",
            "key": "command-palette.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/command-palette.ts",
          "key": "command-palette",
          "resetAction": "reset-command-palette"
        },
        "focusedTest": {
          "path": "packages/site/test/features/command-palette.test.ts",
          "testName": "command-palette focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/command-palette.json",
          "route": "/features/command-palette?state=empty",
          "packageContent": "packages/site/dist/command-palette"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/command-palette.json",
          "capturePath": "quality/captures/site/command-palette.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/command-palette.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/command-palette-supported.json",
          "unavailable": "quality/receipts/site/availability/command-palette-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/command-palette.test.mjs",
          "testName": "command-palette missing contract turns red"
        }
      }
    },
    {
      "id": "destructive-confirmation",
      "title": "Destructive action super confirmation",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/destructive-confirmation.ts",
          "symbol": "registerDestructiveConfirmationFeature",
          "registration": "registerFeature(\"destructive-confirmation\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/destructive-confirmation.md",
          "heading": "Destructive action super confirmation"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/destructive-confirmation.json",
            "key": "destructive-confirmation.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/destructive-confirmation.json",
            "key": "destructive-confirmation.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/destructive-confirmation.json",
            "key": "destructive-confirmation.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/destructive-confirmation.ts",
          "key": "destructive-confirmation",
          "resetAction": "reset-destructive-confirmation"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/destructive-confirmation.test.ts",
          "testName": "destructive-confirmation focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/destructive-confirmation.json",
          "route": "app://claude-design/destructive-confirmation?state=empty",
          "packageContent": "packages/electron/dist/destructive-confirmation"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/destructive-confirmation.json",
          "capturePath": "quality/captures/desktop/destructive-confirmation.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/destructive-confirmation.json",
          "path": "quality/recordings/desktop/destructive-confirmation.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/destructive-confirmation.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/destructive-confirmation-supported.json",
          "unavailable": "quality/receipts/desktop/availability/destructive-confirmation-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/destructive-confirmation.test.mjs",
          "testName": "destructive-confirmation missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/destructive-confirmation.ts",
          "symbol": "registerDestructiveConfirmationFeature",
          "registration": "registerFeature(\"destructive-confirmation\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/destructive-confirmation.md",
          "heading": "Destructive action super confirmation"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/destructive-confirmation.json",
            "key": "destructive-confirmation.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/destructive-confirmation.json",
            "key": "destructive-confirmation.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/destructive-confirmation.json",
            "key": "destructive-confirmation.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/destructive-confirmation.ts",
          "key": "destructive-confirmation",
          "resetAction": "reset-destructive-confirmation"
        },
        "focusedTest": {
          "path": "packages/site/test/features/destructive-confirmation.test.ts",
          "testName": "destructive-confirmation focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/destructive-confirmation.json",
          "route": "/features/destructive-confirmation?state=empty",
          "packageContent": "packages/site/dist/destructive-confirmation"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/destructive-confirmation.json",
          "capturePath": "quality/captures/site/destructive-confirmation.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/destructive-confirmation.json",
          "path": "quality/recordings/site/destructive-confirmation.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/destructive-confirmation.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/destructive-confirmation-supported.json",
          "unavailable": "quality/receipts/site/availability/destructive-confirmation-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/destructive-confirmation.test.mjs",
          "testName": "destructive-confirmation missing contract turns red"
        }
      }
    },
    {
      "id": "local-history",
      "title": "Local version history",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/local-history.ts",
          "symbol": "registerLocalHistoryFeature",
          "registration": "registerFeature(\"local-history\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/local-history.md",
          "heading": "Local version history"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/local-history.json",
            "key": "local-history.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/local-history.json",
            "key": "local-history.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/local-history.json",
            "key": "local-history.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/local-history.ts",
          "key": "local-history",
          "resetAction": "reset-local-history"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/local-history.test.ts",
          "testName": "local-history focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/local-history.json",
          "route": "app://claude-design/local-history?state=empty",
          "packageContent": "packages/electron/dist/local-history"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/local-history.json",
          "capturePath": "quality/captures/desktop/local-history.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/local-history.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/local-history-supported.json",
          "unavailable": "quality/receipts/desktop/availability/local-history-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/local-history.test.mjs",
          "testName": "local-history missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/local-history.ts",
          "symbol": "registerLocalHistoryFeature",
          "registration": "registerFeature(\"local-history\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/local-history.md",
          "heading": "Local version history"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/local-history.json",
            "key": "local-history.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/local-history.json",
            "key": "local-history.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/local-history.json",
            "key": "local-history.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/local-history.ts",
          "key": "local-history",
          "resetAction": "reset-local-history"
        },
        "focusedTest": {
          "path": "packages/site/test/features/local-history.test.ts",
          "testName": "local-history focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/local-history.json",
          "route": "/features/local-history?state=empty",
          "packageContent": "packages/site/dist/local-history"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/local-history.json",
          "capturePath": "quality/captures/site/local-history.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/local-history.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/local-history-supported.json",
          "unavailable": "quality/receipts/site/availability/local-history-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/local-history.test.mjs",
          "testName": "local-history missing contract turns red"
        }
      }
    },
    {
      "id": "changelog-viewer",
      "title": "Changelog viewer",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/changelog-viewer.ts",
          "symbol": "registerChangelogViewerFeature",
          "registration": "registerFeature(\"changelog-viewer\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/changelog-viewer.md",
          "heading": "Changelog viewer"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/changelog-viewer.json",
            "key": "changelog-viewer.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/changelog-viewer.json",
            "key": "changelog-viewer.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/changelog-viewer.json",
            "key": "changelog-viewer.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/changelog-viewer.ts",
          "key": "changelog-viewer",
          "resetAction": "reset-changelog-viewer"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/changelog-viewer.test.ts",
          "testName": "changelog-viewer focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/changelog-viewer.json",
          "route": "app://claude-design/changelog-viewer?state=empty",
          "packageContent": "packages/electron/dist/changelog-viewer"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/changelog-viewer.json",
          "capturePath": "quality/captures/desktop/changelog-viewer.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/changelog-viewer.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/changelog-viewer-supported.json",
          "unavailable": "quality/receipts/desktop/availability/changelog-viewer-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/changelog-viewer.test.mjs",
          "testName": "changelog-viewer missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/changelog-viewer.ts",
          "symbol": "registerChangelogViewerFeature",
          "registration": "registerFeature(\"changelog-viewer\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/changelog-viewer.md",
          "heading": "Changelog viewer"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/changelog-viewer.json",
            "key": "changelog-viewer.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/changelog-viewer.json",
            "key": "changelog-viewer.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/changelog-viewer.json",
            "key": "changelog-viewer.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/changelog-viewer.ts",
          "key": "changelog-viewer",
          "resetAction": "reset-changelog-viewer"
        },
        "focusedTest": {
          "path": "packages/site/test/features/changelog-viewer.test.ts",
          "testName": "changelog-viewer focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/changelog-viewer.json",
          "route": "/features/changelog-viewer?state=empty",
          "packageContent": "packages/site/dist/changelog-viewer"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/changelog-viewer.json",
          "capturePath": "quality/captures/site/changelog-viewer.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/changelog-viewer.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/changelog-viewer-supported.json",
          "unavailable": "quality/receipts/site/availability/changelog-viewer-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/changelog-viewer.test.mjs",
          "testName": "changelog-viewer missing contract turns red"
        }
      }
    },
    {
      "id": "external-editor",
      "title": "External editor handoff",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/external-editor.ts",
          "symbol": "registerExternalEditorFeature",
          "registration": "registerFeature(\"external-editor\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/external-editor.md",
          "heading": "External editor handoff"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/external-editor.json",
            "key": "external-editor.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/external-editor.json",
            "key": "external-editor.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/external-editor.json",
            "key": "external-editor.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/external-editor.ts",
          "key": "external-editor",
          "resetAction": "reset-external-editor"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/external-editor.test.ts",
          "testName": "external-editor focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/external-editor.json",
          "route": "app://claude-design/external-editor?state=empty",
          "packageContent": "packages/electron/dist/external-editor"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/external-editor.json",
          "capturePath": "quality/captures/desktop/external-editor.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/external-editor.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/external-editor-supported.json",
          "unavailable": "quality/receipts/desktop/availability/external-editor-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/external-editor.test.mjs",
          "testName": "external-editor missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/external-editor.ts",
          "symbol": "registerExternalEditorFeature",
          "registration": "registerFeature(\"external-editor\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/external-editor.md",
          "heading": "External editor handoff"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/external-editor.json",
            "key": "external-editor.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/external-editor.json",
            "key": "external-editor.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/external-editor.json",
            "key": "external-editor.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/external-editor.ts",
          "key": "external-editor",
          "resetAction": "reset-external-editor"
        },
        "focusedTest": {
          "path": "packages/site/test/features/external-editor.test.ts",
          "testName": "external-editor focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/external-editor.json",
          "route": "/features/external-editor?state=empty",
          "packageContent": "packages/site/dist/external-editor"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/external-editor.json",
          "capturePath": "quality/captures/site/external-editor.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/external-editor.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/external-editor-supported.json",
          "unavailable": "quality/receipts/site/availability/external-editor-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/external-editor.test.mjs",
          "testName": "external-editor missing contract turns red"
        }
      }
    },
    {
      "id": "exports",
      "title": "Complete export formats",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/exports.ts",
          "symbol": "registerExportsFeature",
          "registration": "registerFeature(\"exports\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/exports.md",
          "heading": "Complete export formats"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/exports.json",
            "key": "exports.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/exports.json",
            "key": "exports.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/exports.json",
            "key": "exports.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/exports.ts",
          "key": "exports",
          "resetAction": "reset-exports"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/exports.test.ts",
          "testName": "exports focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/exports.json",
          "route": "app://claude-design/exports?state=empty",
          "packageContent": "packages/electron/dist/exports"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/exports.json",
          "capturePath": "quality/captures/desktop/exports.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/exports.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/exports-supported.json",
          "unavailable": "quality/receipts/desktop/availability/exports-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/exports.test.mjs",
          "testName": "exports missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/exports.ts",
          "symbol": "registerExportsFeature",
          "registration": "registerFeature(\"exports\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/exports.md",
          "heading": "Complete export formats"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/exports.json",
            "key": "exports.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/exports.json",
            "key": "exports.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/exports.json",
            "key": "exports.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/exports.ts",
          "key": "exports",
          "resetAction": "reset-exports"
        },
        "focusedTest": {
          "path": "packages/site/test/features/exports.test.ts",
          "testName": "exports focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/exports.json",
          "route": "/features/exports?state=empty",
          "packageContent": "packages/site/dist/exports"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/exports.json",
          "capturePath": "quality/captures/site/exports.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/exports.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/exports-supported.json",
          "unavailable": "quality/receipts/site/availability/exports-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/exports.test.mjs",
          "testName": "exports missing contract turns red"
        }
      }
    },
    {
      "id": "bulk-actions",
      "title": "Bulk actions",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/bulk-actions.ts",
          "symbol": "registerBulkActionsFeature",
          "registration": "registerFeature(\"bulk-actions\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/bulk-actions.md",
          "heading": "Bulk actions"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/bulk-actions.json",
            "key": "bulk-actions.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/bulk-actions.json",
            "key": "bulk-actions.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/bulk-actions.json",
            "key": "bulk-actions.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/bulk-actions.ts",
          "key": "bulk-actions",
          "resetAction": "reset-bulk-actions"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/bulk-actions.test.ts",
          "testName": "bulk-actions focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/bulk-actions.json",
          "route": "app://claude-design/bulk-actions?state=empty",
          "packageContent": "packages/electron/dist/bulk-actions"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/bulk-actions.json",
          "capturePath": "quality/captures/desktop/bulk-actions.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/bulk-actions.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/bulk-actions-supported.json",
          "unavailable": "quality/receipts/desktop/availability/bulk-actions-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/bulk-actions.test.mjs",
          "testName": "bulk-actions missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/bulk-actions.ts",
          "symbol": "registerBulkActionsFeature",
          "registration": "registerFeature(\"bulk-actions\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/bulk-actions.md",
          "heading": "Bulk actions"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/bulk-actions.json",
            "key": "bulk-actions.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/bulk-actions.json",
            "key": "bulk-actions.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/bulk-actions.json",
            "key": "bulk-actions.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/bulk-actions.ts",
          "key": "bulk-actions",
          "resetAction": "reset-bulk-actions"
        },
        "focusedTest": {
          "path": "packages/site/test/features/bulk-actions.test.ts",
          "testName": "bulk-actions focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/bulk-actions.json",
          "route": "/features/bulk-actions?state=empty",
          "packageContent": "packages/site/dist/bulk-actions"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/bulk-actions.json",
          "capturePath": "quality/captures/site/bulk-actions.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/bulk-actions.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/bulk-actions-supported.json",
          "unavailable": "quality/receipts/site/availability/bulk-actions-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/bulk-actions.test.mjs",
          "testName": "bulk-actions missing contract turns red"
        }
      }
    },
    {
      "id": "accessibility-responsive-sizing",
      "title": "Accessibility and responsive sizing",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/accessibility-responsive-sizing.ts",
          "symbol": "registerAccessibilityResponsiveSizingFeature",
          "registration": "registerFeature(\"accessibility-responsive-sizing\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/accessibility-responsive-sizing.md",
          "heading": "Accessibility and responsive sizing"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/accessibility-responsive-sizing.json",
            "key": "accessibility-responsive-sizing.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/accessibility-responsive-sizing.json",
            "key": "accessibility-responsive-sizing.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/accessibility-responsive-sizing.json",
            "key": "accessibility-responsive-sizing.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/accessibility-responsive-sizing.ts",
          "key": "accessibility-responsive-sizing",
          "resetAction": "reset-accessibility-responsive-sizing"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/accessibility-responsive-sizing.test.ts",
          "testName": "accessibility-responsive-sizing focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/accessibility-responsive-sizing.json",
          "route": "app://claude-design/accessibility-responsive-sizing?state=empty",
          "packageContent": "packages/electron/dist/accessibility-responsive-sizing"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/accessibility-responsive-sizing.json",
          "capturePath": "quality/captures/desktop/accessibility-responsive-sizing.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/accessibility-responsive-sizing.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/accessibility-responsive-sizing-supported.json",
          "unavailable": "quality/receipts/desktop/availability/accessibility-responsive-sizing-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/accessibility-responsive-sizing.test.mjs",
          "testName": "accessibility-responsive-sizing missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/accessibility-responsive-sizing.ts",
          "symbol": "registerAccessibilityResponsiveSizingFeature",
          "registration": "registerFeature(\"accessibility-responsive-sizing\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/accessibility-responsive-sizing.md",
          "heading": "Accessibility and responsive sizing"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/accessibility-responsive-sizing.json",
            "key": "accessibility-responsive-sizing.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/accessibility-responsive-sizing.json",
            "key": "accessibility-responsive-sizing.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/accessibility-responsive-sizing.json",
            "key": "accessibility-responsive-sizing.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/accessibility-responsive-sizing.ts",
          "key": "accessibility-responsive-sizing",
          "resetAction": "reset-accessibility-responsive-sizing"
        },
        "focusedTest": {
          "path": "packages/site/test/features/accessibility-responsive-sizing.test.ts",
          "testName": "accessibility-responsive-sizing focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/accessibility-responsive-sizing.json",
          "route": "/features/accessibility-responsive-sizing?state=empty",
          "packageContent": "packages/site/dist/accessibility-responsive-sizing"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/accessibility-responsive-sizing.json",
          "capturePath": "quality/captures/site/accessibility-responsive-sizing.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/accessibility-responsive-sizing.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/accessibility-responsive-sizing-supported.json",
          "unavailable": "quality/receipts/site/availability/accessibility-responsive-sizing-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/accessibility-responsive-sizing.test.mjs",
          "testName": "accessibility-responsive-sizing missing contract turns red"
        }
      }
    },
    {
      "id": "personal-vocabulary-upload",
      "title": "Personal vocabulary upload",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/personal-vocabulary-upload.ts",
          "symbol": "registerPersonalVocabularyUploadFeature",
          "registration": "registerFeature(\"personal-vocabulary-upload\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/personal-vocabulary-upload.md",
          "heading": "Personal vocabulary upload"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/personal-vocabulary-upload.json",
            "key": "personal-vocabulary-upload.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/personal-vocabulary-upload.json",
            "key": "personal-vocabulary-upload.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/personal-vocabulary-upload.json",
            "key": "personal-vocabulary-upload.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/personal-vocabulary-upload.ts",
          "key": "personal-vocabulary-upload",
          "resetAction": "reset-personal-vocabulary-upload"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/personal-vocabulary-upload.test.ts",
          "testName": "personal-vocabulary-upload focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/personal-vocabulary-upload.json",
          "route": "app://claude-design/personal-vocabulary-upload?state=empty",
          "packageContent": "packages/electron/dist/personal-vocabulary-upload"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/personal-vocabulary-upload.json",
          "capturePath": "quality/captures/desktop/personal-vocabulary-upload.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/personal-vocabulary-upload.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/personal-vocabulary-upload-supported.json",
          "unavailable": "quality/receipts/desktop/availability/personal-vocabulary-upload-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/personal-vocabulary-upload.test.mjs",
          "testName": "personal-vocabulary-upload missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/personal-vocabulary-upload.ts",
          "symbol": "registerPersonalVocabularyUploadFeature",
          "registration": "registerFeature(\"personal-vocabulary-upload\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/personal-vocabulary-upload.md",
          "heading": "Personal vocabulary upload"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/personal-vocabulary-upload.json",
            "key": "personal-vocabulary-upload.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/personal-vocabulary-upload.json",
            "key": "personal-vocabulary-upload.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/personal-vocabulary-upload.json",
            "key": "personal-vocabulary-upload.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/personal-vocabulary-upload.ts",
          "key": "personal-vocabulary-upload",
          "resetAction": "reset-personal-vocabulary-upload"
        },
        "focusedTest": {
          "path": "packages/site/test/features/personal-vocabulary-upload.test.ts",
          "testName": "personal-vocabulary-upload focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/personal-vocabulary-upload.json",
          "route": "/features/personal-vocabulary-upload?state=empty",
          "packageContent": "packages/site/dist/personal-vocabulary-upload"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/personal-vocabulary-upload.json",
          "capturePath": "quality/captures/site/personal-vocabulary-upload.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/personal-vocabulary-upload.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/personal-vocabulary-upload-supported.json",
          "unavailable": "quality/receipts/site/availability/personal-vocabulary-upload-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/personal-vocabulary-upload.test.mjs",
          "testName": "personal-vocabulary-upload missing contract turns red"
        }
      }
    },
    {
      "id": "toy-locks-authentication",
      "title": "Toy locks and Support Tickets",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/toy-locks-authentication.ts",
          "symbol": "registerToyLocksAuthenticationFeature",
          "registration": "registerFeature(\"toy-locks-authentication\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/toy-locks-authentication.md",
          "heading": "Toy locks and Support Tickets"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/toy-locks-authentication.json",
            "key": "toy-locks-authentication.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/toy-locks-authentication.json",
            "key": "toy-locks-authentication.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/toy-locks-authentication.json",
            "key": "toy-locks-authentication.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/toy-locks-authentication.ts",
          "key": "toy-locks-authentication",
          "resetAction": "reset-toy-locks-authentication"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/toy-locks-authentication.test.ts",
          "testName": "toy-locks-authentication focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/toy-locks-authentication.json",
          "route": "app://claude-design/toy-locks-authentication?state=empty",
          "packageContent": "packages/electron/dist/toy-locks-authentication"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/toy-locks-authentication.json",
          "capturePath": "quality/captures/desktop/toy-locks-authentication.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/toy-locks-authentication.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/toy-locks-authentication-supported.json",
          "unavailable": "quality/receipts/desktop/availability/toy-locks-authentication-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/toy-locks-authentication.test.mjs",
          "testName": "toy-locks-authentication missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/toy-locks-authentication.ts",
          "symbol": "registerToyLocksAuthenticationFeature",
          "registration": "registerFeature(\"toy-locks-authentication\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/toy-locks-authentication.md",
          "heading": "Toy locks and Support Tickets"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/toy-locks-authentication.json",
            "key": "toy-locks-authentication.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/toy-locks-authentication.json",
            "key": "toy-locks-authentication.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/toy-locks-authentication.json",
            "key": "toy-locks-authentication.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/toy-locks-authentication.ts",
          "key": "toy-locks-authentication",
          "resetAction": "reset-toy-locks-authentication"
        },
        "focusedTest": {
          "path": "packages/site/test/features/toy-locks-authentication.test.ts",
          "testName": "toy-locks-authentication focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/toy-locks-authentication.json",
          "route": "/features/toy-locks-authentication?state=empty",
          "packageContent": "packages/site/dist/toy-locks-authentication"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/toy-locks-authentication.json",
          "capturePath": "quality/captures/site/toy-locks-authentication.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/toy-locks-authentication.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/toy-locks-authentication-supported.json",
          "unavailable": "quality/receipts/site/availability/toy-locks-authentication-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/toy-locks-authentication.test.mjs",
          "testName": "toy-locks-authentication missing contract turns red"
        }
      }
    },
    {
      "id": "unlock-ladder",
      "title": "Unlock ladder",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/unlock-ladder.ts",
          "symbol": "registerUnlockLadderFeature",
          "registration": "registerFeature(\"unlock-ladder\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/unlock-ladder.md",
          "heading": "Unlock ladder"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/unlock-ladder.json",
            "key": "unlock-ladder.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/unlock-ladder.json",
            "key": "unlock-ladder.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/unlock-ladder.json",
            "key": "unlock-ladder.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/unlock-ladder.ts",
          "key": "unlock-ladder",
          "resetAction": "reset-unlock-ladder"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/unlock-ladder.test.ts",
          "testName": "unlock-ladder focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/unlock-ladder.json",
          "route": "app://claude-design/unlock-ladder?state=empty",
          "packageContent": "packages/electron/dist/unlock-ladder"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/unlock-ladder.json",
          "capturePath": "quality/captures/desktop/unlock-ladder.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/unlock-ladder.json",
          "path": "quality/recordings/desktop/unlock-ladder.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/unlock-ladder.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/unlock-ladder-supported.json",
          "unavailable": "quality/receipts/desktop/availability/unlock-ladder-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/unlock-ladder.test.mjs",
          "testName": "unlock-ladder missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/unlock-ladder.ts",
          "symbol": "registerUnlockLadderFeature",
          "registration": "registerFeature(\"unlock-ladder\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/unlock-ladder.md",
          "heading": "Unlock ladder"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/unlock-ladder.json",
            "key": "unlock-ladder.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/unlock-ladder.json",
            "key": "unlock-ladder.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/unlock-ladder.json",
            "key": "unlock-ladder.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/unlock-ladder.ts",
          "key": "unlock-ladder",
          "resetAction": "reset-unlock-ladder"
        },
        "focusedTest": {
          "path": "packages/site/test/features/unlock-ladder.test.ts",
          "testName": "unlock-ladder focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/unlock-ladder.json",
          "route": "/features/unlock-ladder?state=empty",
          "packageContent": "packages/site/dist/unlock-ladder"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/unlock-ladder.json",
          "capturePath": "quality/captures/site/unlock-ladder.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/unlock-ladder.json",
          "path": "quality/recordings/site/unlock-ladder.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/unlock-ladder.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/unlock-ladder-supported.json",
          "unavailable": "quality/receipts/site/availability/unlock-ladder-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/unlock-ladder.test.mjs",
          "testName": "unlock-ladder missing contract turns red"
        }
      }
    },
    {
      "id": "shared-link-embed",
      "title": "Shared-link embed graphic",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/shared-link-embed.ts",
          "symbol": "registerSharedLinkEmbedFeature",
          "registration": "registerFeature(\"shared-link-embed\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/shared-link-embed.md",
          "heading": "Shared-link embed graphic"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/shared-link-embed.json",
            "key": "shared-link-embed.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/shared-link-embed.json",
            "key": "shared-link-embed.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/shared-link-embed.json",
            "key": "shared-link-embed.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/shared-link-embed.ts",
          "key": "shared-link-embed",
          "resetAction": "reset-shared-link-embed"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/shared-link-embed.test.ts",
          "testName": "shared-link-embed focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/shared-link-embed.json",
          "route": "app://claude-design/shared-link-embed?state=empty",
          "packageContent": "packages/electron/dist/shared-link-embed"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/shared-link-embed.json",
          "capturePath": "quality/captures/desktop/shared-link-embed.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/shared-link-embed.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/shared-link-embed-supported.json",
          "unavailable": "quality/receipts/desktop/availability/shared-link-embed-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/shared-link-embed.test.mjs",
          "testName": "shared-link-embed missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/shared-link-embed.ts",
          "symbol": "registerSharedLinkEmbedFeature",
          "registration": "registerFeature(\"shared-link-embed\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/shared-link-embed.md",
          "heading": "Shared-link embed graphic"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/shared-link-embed.json",
            "key": "shared-link-embed.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/shared-link-embed.json",
            "key": "shared-link-embed.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/shared-link-embed.json",
            "key": "shared-link-embed.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/shared-link-embed.ts",
          "key": "shared-link-embed",
          "resetAction": "reset-shared-link-embed"
        },
        "focusedTest": {
          "path": "packages/site/test/features/shared-link-embed.test.ts",
          "testName": "shared-link-embed focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/shared-link-embed.json",
          "route": "/features/shared-link-embed?state=empty",
          "packageContent": "packages/site/dist/shared-link-embed"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/shared-link-embed.json",
          "capturePath": "quality/captures/site/shared-link-embed.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/shared-link-embed.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/shared-link-embed-supported.json",
          "unavailable": "quality/receipts/site/availability/shared-link-embed-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/shared-link-embed.test.mjs",
          "testName": "shared-link-embed missing contract turns red"
        }
      }
    },
    {
      "id": "adhd-modes",
      "title": "ADHD interface modes",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/adhd-modes.ts",
          "symbol": "registerAdhdModesFeature",
          "registration": "registerFeature(\"adhd-modes\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/adhd-modes.md",
          "heading": "ADHD interface modes"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/adhd-modes.json",
            "key": "adhd-modes.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/adhd-modes.json",
            "key": "adhd-modes.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/adhd-modes.json",
            "key": "adhd-modes.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/adhd-modes.ts",
          "key": "adhd-modes",
          "resetAction": "reset-adhd-modes"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/adhd-modes.test.ts",
          "testName": "adhd-modes focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/adhd-modes.json",
          "route": "app://claude-design/adhd-modes?state=empty",
          "packageContent": "packages/electron/dist/adhd-modes"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/adhd-modes.json",
          "capturePath": "quality/captures/desktop/adhd-modes.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/adhd-modes.json",
          "path": "quality/recordings/desktop/adhd-modes.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/adhd-modes.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/adhd-modes-supported.json",
          "unavailable": "quality/receipts/desktop/availability/adhd-modes-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/adhd-modes.test.mjs",
          "testName": "adhd-modes missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/adhd-modes.ts",
          "symbol": "registerAdhdModesFeature",
          "registration": "registerFeature(\"adhd-modes\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/adhd-modes.md",
          "heading": "ADHD interface modes"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/adhd-modes.json",
            "key": "adhd-modes.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/adhd-modes.json",
            "key": "adhd-modes.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/adhd-modes.json",
            "key": "adhd-modes.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/adhd-modes.ts",
          "key": "adhd-modes",
          "resetAction": "reset-adhd-modes"
        },
        "focusedTest": {
          "path": "packages/site/test/features/adhd-modes.test.ts",
          "testName": "adhd-modes focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/adhd-modes.json",
          "route": "/features/adhd-modes?state=empty",
          "packageContent": "packages/site/dist/adhd-modes"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/adhd-modes.json",
          "capturePath": "quality/captures/site/adhd-modes.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/adhd-modes.json",
          "path": "quality/recordings/site/adhd-modes.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/adhd-modes.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/adhd-modes-supported.json",
          "unavailable": "quality/receipts/site/availability/adhd-modes-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/adhd-modes.test.mjs",
          "testName": "adhd-modes missing contract turns red"
        }
      }
    },
    {
      "id": "browser-download-surfaces",
      "title": "Browser extension download flow",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/browser-download-surfaces.ts",
          "symbol": "registerBrowserDownloadSurfacesFeature",
          "registration": "registerFeature(\"browser-download-surfaces\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/browser-download-surfaces.md",
          "heading": "Browser extension download flow"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/browser-download-surfaces.json",
            "key": "browser-download-surfaces.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/browser-download-surfaces.json",
            "key": "browser-download-surfaces.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/browser-download-surfaces.json",
            "key": "browser-download-surfaces.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/browser-download-surfaces.ts",
          "key": "browser-download-surfaces",
          "resetAction": "reset-browser-download-surfaces"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/browser-download-surfaces.test.ts",
          "testName": "browser-download-surfaces focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/browser-download-surfaces.json",
          "route": "app://claude-design/browser-download-surfaces?state=empty",
          "packageContent": "packages/electron/dist/browser-download-surfaces"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/browser-download-surfaces.json",
          "capturePath": "quality/captures/desktop/browser-download-surfaces.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/browser-download-surfaces.json",
          "path": "quality/recordings/desktop/browser-download-surfaces.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/browser-download-surfaces.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/browser-download-surfaces-supported.json",
          "unavailable": "quality/receipts/desktop/availability/browser-download-surfaces-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/browser-download-surfaces.test.mjs",
          "testName": "browser-download-surfaces missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/browser-download-surfaces.ts",
          "symbol": "registerBrowserDownloadSurfacesFeature",
          "registration": "registerFeature(\"browser-download-surfaces\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/browser-download-surfaces.md",
          "heading": "Browser extension download flow"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/browser-download-surfaces.json",
            "key": "browser-download-surfaces.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/browser-download-surfaces.json",
            "key": "browser-download-surfaces.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/browser-download-surfaces.json",
            "key": "browser-download-surfaces.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/browser-download-surfaces.ts",
          "key": "browser-download-surfaces",
          "resetAction": "reset-browser-download-surfaces"
        },
        "focusedTest": {
          "path": "packages/site/test/features/browser-download-surfaces.test.ts",
          "testName": "browser-download-surfaces focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/browser-download-surfaces.json",
          "route": "/features/browser-download-surfaces?state=empty",
          "packageContent": "packages/site/dist/browser-download-surfaces"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/browser-download-surfaces.json",
          "capturePath": "quality/captures/site/browser-download-surfaces.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/browser-download-surfaces.json",
          "path": "quality/recordings/site/browser-download-surfaces.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/browser-download-surfaces.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/browser-download-surfaces-supported.json",
          "unavailable": "quality/receipts/site/availability/browser-download-surfaces-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/browser-download-surfaces.test.mjs",
          "testName": "browser-download-surfaces missing contract turns red"
        }
      }
    },
    {
      "id": "app-logo-customization",
      "title": "App logo customization",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/app-logo-customization.ts",
          "symbol": "registerAppLogoCustomizationFeature",
          "registration": "registerFeature(\"app-logo-customization\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/app-logo-customization.md",
          "heading": "App logo customization"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/app-logo-customization.json",
            "key": "app-logo-customization.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/app-logo-customization.json",
            "key": "app-logo-customization.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/app-logo-customization.json",
            "key": "app-logo-customization.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/app-logo-customization.ts",
          "key": "app-logo-customization",
          "resetAction": "reset-app-logo-customization"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/app-logo-customization.test.ts",
          "testName": "app-logo-customization focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/app-logo-customization.json",
          "route": "app://claude-design/app-logo-customization?state=empty",
          "packageContent": "packages/electron/dist/app-logo-customization"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/app-logo-customization.json",
          "capturePath": "quality/captures/desktop/app-logo-customization.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/app-logo-customization.json",
          "path": "quality/recordings/desktop/app-logo-customization.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/app-logo-customization.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/app-logo-customization-supported.json",
          "unavailable": "quality/receipts/desktop/availability/app-logo-customization-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/app-logo-customization.test.mjs",
          "testName": "app-logo-customization missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/app-logo-customization.ts",
          "symbol": "registerAppLogoCustomizationFeature",
          "registration": "registerFeature(\"app-logo-customization\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/app-logo-customization.md",
          "heading": "App logo customization"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/app-logo-customization.json",
            "key": "app-logo-customization.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/app-logo-customization.json",
            "key": "app-logo-customization.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/app-logo-customization.json",
            "key": "app-logo-customization.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/app-logo-customization.ts",
          "key": "app-logo-customization",
          "resetAction": "reset-app-logo-customization"
        },
        "focusedTest": {
          "path": "packages/site/test/features/app-logo-customization.test.ts",
          "testName": "app-logo-customization focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/app-logo-customization.json",
          "route": "/features/app-logo-customization?state=empty",
          "packageContent": "packages/site/dist/app-logo-customization"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/app-logo-customization.json",
          "capturePath": "quality/captures/site/app-logo-customization.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/app-logo-customization.json",
          "path": "quality/recordings/site/app-logo-customization.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/app-logo-customization.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/app-logo-customization-supported.json",
          "unavailable": "quality/receipts/site/availability/app-logo-customization-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/app-logo-customization.test.mjs",
          "testName": "app-logo-customization missing contract turns red"
        }
      }
    },
    {
      "id": "file-converter",
      "title": "Local file converter",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/file-converter.ts",
          "symbol": "registerFileConverterFeature",
          "registration": "registerFeature(\"file-converter\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/file-converter.md",
          "heading": "Local file converter"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/file-converter.json",
            "key": "file-converter.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/file-converter.json",
            "key": "file-converter.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/file-converter.json",
            "key": "file-converter.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/file-converter.ts",
          "key": "file-converter",
          "resetAction": "reset-file-converter"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/file-converter.test.ts",
          "testName": "file-converter focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/file-converter.json",
          "route": "app://claude-design/file-converter?state=empty",
          "packageContent": "packages/electron/dist/file-converter"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/file-converter.json",
          "capturePath": "quality/captures/desktop/file-converter.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/file-converter.json",
          "path": "quality/recordings/desktop/file-converter.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/file-converter.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/file-converter-supported.json",
          "unavailable": "quality/receipts/desktop/availability/file-converter-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/file-converter.test.mjs",
          "testName": "file-converter missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/file-converter.ts",
          "symbol": "registerFileConverterFeature",
          "registration": "registerFeature(\"file-converter\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/file-converter.md",
          "heading": "Local file converter"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/file-converter.json",
            "key": "file-converter.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/file-converter.json",
            "key": "file-converter.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/file-converter.json",
            "key": "file-converter.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/file-converter.ts",
          "key": "file-converter",
          "resetAction": "reset-file-converter"
        },
        "focusedTest": {
          "path": "packages/site/test/features/file-converter.test.ts",
          "testName": "file-converter focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/file-converter.json",
          "route": "/features/file-converter?state=empty",
          "packageContent": "packages/site/dist/file-converter"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/file-converter.json",
          "capturePath": "quality/captures/site/file-converter.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/file-converter.json",
          "path": "quality/recordings/site/file-converter.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/file-converter.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/file-converter-supported.json",
          "unavailable": "quality/receipts/site/availability/file-converter-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/file-converter.test.mjs",
          "testName": "file-converter missing contract turns red"
        }
      }
    },
    {
      "id": "ollama-suite-manager",
      "title": "Local Ollama suite manager",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/ollama-suite-manager.ts",
          "symbol": "registerOllamaSuiteManagerFeature",
          "registration": "registerFeature(\"ollama-suite-manager\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/ollama-suite-manager.md",
          "heading": "Local Ollama suite manager"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/ollama-suite-manager.json",
            "key": "ollama-suite-manager.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/ollama-suite-manager.json",
            "key": "ollama-suite-manager.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/ollama-suite-manager.json",
            "key": "ollama-suite-manager.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/ollama-suite-manager.ts",
          "key": "ollama-suite-manager",
          "resetAction": "reset-ollama-suite-manager"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/ollama-suite-manager.test.ts",
          "testName": "ollama-suite-manager focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/ollama-suite-manager.json",
          "route": "app://claude-design/ollama-suite-manager?state=empty",
          "packageContent": "packages/electron/dist/ollama-suite-manager"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/ollama-suite-manager.json",
          "capturePath": "quality/captures/desktop/ollama-suite-manager.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/ollama-suite-manager.json",
          "path": "quality/recordings/desktop/ollama-suite-manager.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/ollama-suite-manager.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/ollama-suite-manager-supported.json",
          "unavailable": "quality/receipts/desktop/availability/ollama-suite-manager-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/ollama-suite-manager.test.mjs",
          "testName": "ollama-suite-manager missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/ollama-suite-manager.ts",
          "symbol": "registerOllamaSuiteManagerFeature",
          "registration": "registerFeature(\"ollama-suite-manager\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/ollama-suite-manager.md",
          "heading": "Local Ollama suite manager"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/ollama-suite-manager.json",
            "key": "ollama-suite-manager.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/ollama-suite-manager.json",
            "key": "ollama-suite-manager.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/ollama-suite-manager.json",
            "key": "ollama-suite-manager.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/ollama-suite-manager.ts",
          "key": "ollama-suite-manager",
          "resetAction": "reset-ollama-suite-manager"
        },
        "focusedTest": {
          "path": "packages/site/test/features/ollama-suite-manager.test.ts",
          "testName": "ollama-suite-manager focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/ollama-suite-manager.json",
          "route": "/features/ollama-suite-manager?state=empty",
          "packageContent": "packages/site/dist/ollama-suite-manager"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/ollama-suite-manager.json",
          "capturePath": "quality/captures/site/ollama-suite-manager.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/ollama-suite-manager.json",
          "path": "quality/recordings/site/ollama-suite-manager.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/ollama-suite-manager.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/ollama-suite-manager-supported.json",
          "unavailable": "quality/receipts/site/availability/ollama-suite-manager-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/ollama-suite-manager.test.mjs",
          "testName": "ollama-suite-manager missing contract turns red"
        }
      }
    },
    {
      "id": "status-hub",
      "title": "Status Hub",
      "motionApplies": true,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/status-hub.ts",
          "symbol": "registerStatusHubFeature",
          "registration": "registerFeature(\"status-hub\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/status-hub.md",
          "heading": "Status Hub"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/status-hub.json",
            "key": "status-hub.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/status-hub.json",
            "key": "status-hub.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/status-hub.json",
            "key": "status-hub.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/status-hub.ts",
          "key": "status-hub",
          "resetAction": "reset-status-hub"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/status-hub.test.ts",
          "testName": "status-hub focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/status-hub.json",
          "route": "app://claude-design/status-hub?state=empty",
          "packageContent": "packages/electron/dist/status-hub"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/status-hub.json",
          "capturePath": "quality/captures/desktop/status-hub.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/desktop/recordings/status-hub.json",
          "path": "quality/recordings/desktop/status-hub.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/status-hub.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/status-hub-supported.json",
          "unavailable": "quality/receipts/desktop/availability/status-hub-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/status-hub.test.mjs",
          "testName": "status-hub missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/status-hub.ts",
          "symbol": "registerStatusHubFeature",
          "registration": "registerFeature(\"status-hub\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/status-hub.md",
          "heading": "Status Hub"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/status-hub.json",
            "key": "status-hub.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/status-hub.json",
            "key": "status-hub.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/status-hub.json",
            "key": "status-hub.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/status-hub.ts",
          "key": "status-hub",
          "resetAction": "reset-status-hub"
        },
        "focusedTest": {
          "path": "packages/site/test/features/status-hub.test.ts",
          "testName": "status-hub focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/status-hub.json",
          "route": "/features/status-hub?state=empty",
          "packageContent": "packages/site/dist/status-hub"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/status-hub.json",
          "capturePath": "quality/captures/site/status-hub.png"
        },
        "recording": {
          "required": true,
          "receiptPath": "quality/receipts/site/recordings/status-hub.json",
          "path": "quality/recordings/site/status-hub.webm"
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/status-hub.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/status-hub-supported.json",
          "unavailable": "quality/receipts/site/availability/status-hub-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/status-hub.test.mjs",
          "testName": "status-hub missing contract turns red"
        }
      }
    },
    {
      "id": "front-screen-provenance",
      "title": "Front-screen version provenance",
      "motionApplies": false,
      "desktop": {
        "implementation": {
          "path": "packages/electron/src/features/front-screen-provenance.ts",
          "symbol": "registerFrontScreenProvenanceFeature",
          "registration": "registerFeature(\"front-screen-provenance\")"
        },
        "documentation": {
          "article": "docs/src/content/docs/features/front-screen-provenance.md",
          "heading": "Front-screen version provenance"
        },
        "localization": {
          "en": {
            "path": "packages/electron/src/locales/en/front-screen-provenance.json",
            "key": "front-screen-provenance.title"
          },
          "zhHant": {
            "path": "packages/electron/src/locales/zh-Hant/front-screen-provenance.json",
            "key": "front-screen-provenance.title"
          },
          "bilingual": {
            "path": "packages/electron/src/locales/bilingual/front-screen-provenance.json",
            "key": "front-screen-provenance.title"
          }
        },
        "persistence": {
          "path": "packages/electron/src/state/front-screen-provenance.ts",
          "key": "front-screen-provenance",
          "resetAction": "reset-front-screen-provenance"
        },
        "focusedTest": {
          "path": "packages/electron/test/features/front-screen-provenance.test.ts",
          "testName": "front-screen-provenance focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/desktop/interaction/front-screen-provenance.json",
          "route": "app://claude-design/front-screen-provenance?state=empty",
          "packageContent": "packages/electron/dist/front-screen-provenance"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/desktop/captures/front-screen-provenance.json",
          "capturePath": "quality/captures/desktop/front-screen-provenance.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/desktop/privacy/front-screen-provenance.json"
        },
        "availability": {
          "supported": "quality/receipts/desktop/availability/front-screen-provenance-supported.json",
          "unavailable": "quality/receipts/desktop/availability/front-screen-provenance-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/desktop/front-screen-provenance.test.mjs",
          "testName": "front-screen-provenance missing contract turns red"
        }
      },
      "site": {
        "implementation": {
          "path": "packages/site/src/features/front-screen-provenance.ts",
          "symbol": "registerFrontScreenProvenanceFeature",
          "registration": "registerFeature(\"front-screen-provenance\")"
        },
        "documentation": {
          "article": "docs/src/content/site/features/front-screen-provenance.md",
          "heading": "Front-screen version provenance"
        },
        "localization": {
          "en": {
            "path": "packages/site/src/locales/en/front-screen-provenance.json",
            "key": "front-screen-provenance.title"
          },
          "zhHant": {
            "path": "packages/site/src/locales/zh-Hant/front-screen-provenance.json",
            "key": "front-screen-provenance.title"
          },
          "bilingual": {
            "path": "packages/site/src/locales/bilingual/front-screen-provenance.json",
            "key": "front-screen-provenance.title"
          }
        },
        "persistence": {
          "path": "packages/site/src/state/front-screen-provenance.ts",
          "key": "front-screen-provenance",
          "resetAction": "reset-front-screen-provenance"
        },
        "focusedTest": {
          "path": "packages/site/test/features/front-screen-provenance.test.ts",
          "testName": "front-screen-provenance focused behavior"
        },
        "builtInteraction": {
          "receiptPath": "quality/receipts/site/interaction/front-screen-provenance.json",
          "route": "/features/front-screen-provenance?state=empty",
          "packageContent": "packages/site/dist/front-screen-provenance"
        },
        "genuineCapture": {
          "receiptPath": "quality/receipts/site/captures/front-screen-provenance.json",
          "capturePath": "quality/captures/site/front-screen-provenance.png"
        },
        "recording": {
          "required": false,
          "receiptPath": null,
          "path": null
        },
        "dataBoundary": {
          "statement": "The feature data stays within the declared local or explicitly documented external boundary.",
          "assertedBy": "quality/receipts/site/privacy/front-screen-provenance.json"
        },
        "availability": {
          "supported": "quality/receipts/site/availability/front-screen-provenance-supported.json",
          "unavailable": "quality/receipts/site/availability/front-screen-provenance-unavailable.json"
        },
        "negativeCase": {
          "path": "quality/self-tests/site/front-screen-provenance.test.mjs",
          "testName": "front-screen-provenance missing contract turns red"
        }
      }
    }
  ]
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
