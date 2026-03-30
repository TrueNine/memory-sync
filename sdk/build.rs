use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    #[cfg(feature = "napi")]
    napi_build::setup();

    // Check if embedded-runtime feature is enabled via CARGO_FEATURE_* env var
    // Note: #[cfg(feature = ...)] doesn't work in build.rs at runtime,
    // we must check the environment variable set by cargo
    if env::var("CARGO_FEATURE_EMBEDDED_RUNTIME").is_ok() {
        let out_dir = env::var("OUT_DIR").expect("OUT_DIR not set");
        let dest = Path::new(&out_dir).join("plugin-runtime.mjs");

        // Try multiple possible locations for plugin-runtime.mjs
        let possible_sources = vec![
            // Already built in sdk/dist
            PathBuf::from("dist/plugin-runtime.mjs"),
            // From repo root
            PathBuf::from("sdk/dist/plugin-runtime.mjs"),
            // CI workspace path (when building from repo root)
            PathBuf::from("../sdk/dist/plugin-runtime.mjs"),
        ];

        let mut found = false;
        for src in &possible_sources {
            if src.exists() {
                fs::copy(src, &dest).expect("Failed to copy plugin-runtime.mjs");
                println!("cargo:rerun-if-changed={}", src.display());
                found = true;
                break;
            }
        }

        if !found {
            panic!(
                "plugin-runtime.mjs not found for embedded-runtime feature. \
                 Please build it first with: pnpm -F @truenine/memory-sync-sdk exec tsdown \
                 Searched paths: {:?}",
                possible_sources
            );
        }

        println!("cargo:rerun-if-changed=build.rs");
    }
}
