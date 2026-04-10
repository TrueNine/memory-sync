use std::env;

fn main() {
  #[cfg(feature = "napi")]
  napi_build::setup();

  // The embedded-runtime feature and plugin-runtime.mjs have been removed
  // as part of the Rust-owned runtime core rewrite. Build scripts no longer
  // need to bundle a Node.js bridge entry point.
  let _ = env::var("CARGO_FEATURE_EMBEDDED_RUNTIME");
  println!("cargo:rerun-if-changed=build.rs");
}
