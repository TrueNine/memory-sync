#![deny(clippy::all)]

//! Embedded file templates for the `tnmsc init` command.
//!
//! Templates are embedded at compile time via `include_str!()`.
//! Mirrors the TS `@truenine/init-bundle` package's `bundlePaths` list.

/// A single bundle item: relative path + embedded content.
pub struct BundleItem {
    pub path: &'static str,
    pub content: &'static str,
}

/// Base path for include_str! macros (relative to this source file).
/// Points to: packages/init-bundle/public/
const _BASE: &str = "packages/init-bundle/public";

/// All embedded bundle items, matching the TS `bundlePaths` list.
pub static BUNDLES: &[BundleItem] = &[
    BundleItem {
        path: "app/global.cn.mdx",
        content: include_str!("../public/app/global.cn.mdx"),
    },
    BundleItem {
        path: ".idea/.gitignore",
        content: include_str!("../public/.idea/.gitignore"),
    },
    BundleItem {
        path: ".idea/codeStyles/Project.xml",
        content: include_str!("../public/.idea/codeStyles/Project.xml"),
    },
    BundleItem {
        path: ".idea/codeStyles/codeStyleConfig.xml",
        content: include_str!("../public/.idea/codeStyles/codeStyleConfig.xml"),
    },
    BundleItem {
        path: ".vscode/settings.json",
        content: include_str!("../public/.vscode/settings.json"),
    },
    BundleItem {
        path: ".vscode/extensions.json",
        content: include_str!("../public/.vscode/extensions.json"),
    },
    BundleItem {
        path: ".editorconfig",
        content: include_str!("../public/.editorconfig"),
    },
    BundleItem {
        path: ".gitignore",
        content: include_str!("../public/.gitignore"),
    },
    BundleItem {
        path: "public/tnmsc.example.json",
        content: include_str!("../public/public/tnmsc.example.json"),
    },
    BundleItem {
        path: "public/exclude",
        content: include_str!("../public/public/exclude"),
    },
    BundleItem {
        path: "public/gitignore",
        content: include_str!("../public/public/gitignore"),
    },
    BundleItem {
        path: "public/kiro_global_powers_registry.json",
        content: include_str!("../public/public/kiro_global_powers_registry.json"),
    },
    BundleItem {
        path: "src/skills/prompt-builder/global-memory-prompt.cn.mdx",
        content: include_str!("../public/src/skills/prompt-builder/global-memory-prompt.cn.mdx"),
    },
    BundleItem {
        path: "src/skills/prompt-builder/root-memory-prompt.cn.mdx",
        content: include_str!("../public/src/skills/prompt-builder/root-memory-prompt.cn.mdx"),
    },
    BundleItem {
        path: "src/skills/prompt-builder/child-memory-prompt.cn.mdx",
        content: include_str!("../public/src/skills/prompt-builder/child-memory-prompt.cn.mdx"),
    },
];

/// Get the default user config JSON content (from `public/tnmsc.example.json`).
pub fn get_default_config_content() -> &'static str {
    BUNDLES
        .iter()
        .find(|b| b.path == "public/tnmsc.example.json")
        .map(|b| b.content)
        .unwrap_or("{}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bundles_not_empty() {
        assert!(!BUNDLES.is_empty());
        assert_eq!(BUNDLES.len(), 15);
    }

    #[test]
    fn test_each_bundle_has_content() {
        for bundle in BUNDLES {
            assert!(!bundle.path.is_empty(), "Bundle path should not be empty");
            assert!(!bundle.content.is_empty(), "Bundle content for '{}' should not be empty", bundle.path);
        }
    }

    #[test]
    fn test_default_config_is_valid_json() {
        let content = get_default_config_content();
        let parsed: serde_json::Result<serde_json::Value> = serde_json::from_str(content);
        assert!(parsed.is_ok(), "Default config should be valid JSON");
        let val = parsed.unwrap();
        assert!(val.is_object(), "Default config should be a JSON object");
    }

    #[test]
    fn test_bundle_paths_match_ts() {
        let expected_paths = [
            "app/global.cn.mdx",
            ".idea/.gitignore",
            ".idea/codeStyles/Project.xml",
            ".idea/codeStyles/codeStyleConfig.xml",
            ".vscode/settings.json",
            ".vscode/extensions.json",
            ".editorconfig",
            ".gitignore",
            "public/tnmsc.example.json",
            "public/exclude",
            "public/gitignore",
            "public/kiro_global_powers_registry.json",
            "src/skills/prompt-builder/global-memory-prompt.cn.mdx",
            "src/skills/prompt-builder/root-memory-prompt.cn.mdx",
            "src/skills/prompt-builder/child-memory-prompt.cn.mdx",
        ];
        for (i, expected) in expected_paths.iter().enumerate() {
            assert_eq!(BUNDLES[i].path, *expected, "Bundle path mismatch at index {i}");
        }
    }
}

// ===========================================================================
// NAPI binding layer (only compiled with --features napi)
// ===========================================================================

#[cfg(feature = "napi")]
mod napi_binding {
    use napi_derive::napi;
    use super::{BUNDLES, get_default_config_content};

    #[napi(object)]
    pub struct NapiBundleItem {
        pub path: String,
        pub content: String,
    }

    #[napi]
    pub fn get_bundles() -> Vec<NapiBundleItem> {
        BUNDLES.iter().map(|b| NapiBundleItem {
            path: b.path.to_string(),
            content: b.content.to_string(),
        }).collect()
    }

    #[napi]
    pub fn get_default_config_content_str() -> String {
        get_default_config_content().to_string()
    }

    #[napi]
    pub fn get_bundle_by_path(path: String) -> Option<NapiBundleItem> {
        BUNDLES.iter().find(|b| b.path == path).map(|b| NapiBundleItem {
            path: b.path.to_string(),
            content: b.content.to_string(),
        })
    }
}

