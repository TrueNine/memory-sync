use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // Only process embedded-runtime when the feature is enabled
    if env::var("CARGO_FEATURE_EMBEDDED_RUNTIME").is_ok() {
        let out_dir = env::var("OUT_DIR").expect("OUT_DIR not set");
        let dest = Path::new(&out_dir).join("plugin-runtime.mjs");

        // Look for plugin-runtime.mjs relative to the crate root
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
        let source = Path::new(&manifest_dir).join("dist/plugin-runtime.mjs");

        if source.exists() {
            fs::copy(&source, &dest).expect("Failed to copy plugin-runtime.mjs to OUT_DIR");
            println!("cargo:rerun-if-changed={}", source.display());
        } else {
            // Write empty placeholder so include_str! doesn't fail
            fs::write(&dest, "").expect("Failed to write empty plugin-runtime.mjs");
            println!(
                "cargo:warning=plugin-runtime.mjs not found at {}. Build with 'pnpm -F @truenine/memory-sync-cli run bundle' first.",
                source.display()
            );
        }

        println!("cargo:rerun-if-changed=dist/plugin-runtime.mjs");
    }
}
