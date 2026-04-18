use std::fs;
use std::path::PathBuf;

use crate::infra::desk_paths;

const JETBRAINS_VENDOR_DIR: &str = "JetBrains";
const JETBRAINS_AIA_DIR: &str = "aia";
const JETBRAINS_CODEX_DIR: &str = "codex";

const SUPPORTED_JETBRAINS_IDE_DIR_PREFIXES: &[&str] = &[
  "IntelliJIdea",
  "WebStorm",
  "RustRover",
  "PyCharm",
  "PyCharmCE",
  "PhpStorm",
  "GoLand",
  "CLion",
  "DataGrip",
  "RubyMine",
  "Rider",
  "DataSpell",
  "Aqua",
];

fn is_supported_jetbrains_ide_dir(dir_name: &str) -> bool {
  SUPPORTED_JETBRAINS_IDE_DIR_PREFIXES
    .iter()
    .any(|prefix| dir_name.starts_with(prefix))
}

/// Discover JetBrains codex directories under the platform fixed dir.
pub fn discover_jetbrains_codex_dirs() -> Vec<String> {
  let Ok(base) = desk_paths::get_platform_fixed_dir() else {
    return Vec::new();
  };
  let jetbrains_base = PathBuf::from(base).join(JETBRAINS_VENDOR_DIR);

  let entries = match fs::read_dir(&jetbrains_base) {
    Ok(entries) => entries,
    Err(_) => return Vec::new(),
  };

  let mut result = Vec::new();
  for entry in entries.flatten() {
    let metadata = match entry.metadata() {
      Ok(m) => m,
      Err(_) => continue,
    };
    if !metadata.is_dir() {
      continue;
    }
    let name = entry.file_name();
    let Some(name_str) = name.to_str() else {
      continue;
    };
    if !is_supported_jetbrains_ide_dir(name_str) {
      continue;
    }
    let codex_dir = jetbrains_base
      .join(name_str)
      .join(JETBRAINS_AIA_DIR)
      .join(JETBRAINS_CODEX_DIR);
    result.push(codex_dir.to_string_lossy().into_owned());
  }
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn is_supported_jetbrains_ide_dir_matches() {
    assert!(is_supported_jetbrains_ide_dir("IntelliJIdea2024.1"));
    assert!(is_supported_jetbrains_ide_dir("WebStorm"));
    assert!(!is_supported_jetbrains_ide_dir("UnknownIDE"));
  }
}
