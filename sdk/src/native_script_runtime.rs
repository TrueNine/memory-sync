#![deny(clippy::all)]

use std::path::{Component, Path, PathBuf};

// ---------------------------------------------------------------------------
// Public path proxy — pure Rust reimplementation of aindex/public/proxy.ts
//
// The original proxy.ts is a 34-line TypeScript module that remaps "hidden"
// dot-prefixed paths so they can be stored on disk without actually creating
// dot-files or dot-directories (which many tools and VCS systems treat
// specially).
//
// Mapping rules (applied to forward-slash-normalized input):
//
//   1. `.git/`  prefix → `____.git/`
//   2. `.zed/`  prefix → `____.zed/`
//   3. `.idea/` prefix → `____idea/`    (note: no dot after ____)
//   4. `.vscode/` prefix → `____vscode/`  (note: no dot after ____)
//   5. Any other `.<segment>/` or `.<segment>` at the start → `____<segment>/` or `____<segment>`
//   6. Paths that don't start with `.` pass through unchanged
//
// ---------------------------------------------------------------------------

struct PrefixRule {
  match_prefix: &'static str,
  replacement: &'static str,
}

const PREFIX_RULES: [PrefixRule; 4] = [
  PrefixRule {
    match_prefix: ".git/",
    replacement: "____.git/",
  },
  PrefixRule {
    match_prefix: ".zed/",
    replacement: "____.zed/",
  },
  PrefixRule {
    match_prefix: ".idea/",
    replacement: "____idea/",
  },
  PrefixRule {
    match_prefix: ".vscode/",
    replacement: "____vscode/",
  },
];

pub fn proxy_public_path(logical_path: &str) -> String {
  let normalized = logical_path.replace('\\', "/");

  for rule in &PREFIX_RULES {
    if normalized.starts_with(rule.match_prefix) {
      return normalized.replacen(rule.match_prefix, rule.replacement, 1);
    }
  }

  if !normalized.starts_with('.') {
    return normalized;
  }

  if let Some(rest) = normalized.strip_prefix('.') {
    if rest.is_empty() {
      return normalized;
    }
    if let Some(slash_pos) = rest.find('/') {
      let name = &rest[..slash_pos];
      let suffix = &rest[slash_pos..];
      return format!("____{name}{suffix}");
    }
    let name = rest;
    format!("____{name}")
  } else {
    normalized
  }
}

fn normalize_path(path: &Path) -> Result<PathBuf, String> {
  let mut normalized = PathBuf::new();

  for component in path.components() {
    match component {
      Component::Prefix(prefix) => {
        normalized.push(prefix.as_os_str());
      }
      Component::RootDir => {
        normalized.push(component.as_os_str());
      }
      Component::CurDir => {}
      Component::ParentDir => {
        if !normalized.pop() {
          return Err(format!("Path escapes root: {}", path.display()));
        }
      }
      Component::Normal(segment) => {
        normalized.push(segment);
      }
    }
  }

  Ok(normalized)
}

fn absolute_base_path(path_str: &str) -> Result<PathBuf, String> {
  let path = PathBuf::from(path_str);
  let base_path = if path.is_absolute() {
    path
  } else {
    std::env::current_dir()
      .map_err(|error| format!("Failed to resolve current directory: {error}"))?
      .join(path)
  };

  normalize_path(&base_path)
}

fn ensure_within_root(resolved: &Path, root: &Path, label: &str) -> Result<(), String> {
  if resolved.starts_with(root) {
    return Ok(());
  }

  Err(format!(
    "{label} escapes public root: {} is not within {}",
    resolved.display(),
    root.display()
  ))
}

pub fn validate_public_path_impl(
  resolved_path: &str,
  aindex_public_dir: &str,
) -> Result<String, String> {
  let trimmed_path = resolved_path.trim();
  if trimmed_path.is_empty() {
    return Err("Resolved public path cannot be empty".into());
  }

  let normalized_path = trimmed_path.replace('\\', "/");
  let candidate_path = PathBuf::from(&normalized_path);
  if candidate_path.is_absolute() {
    return Err(format!(
      "Resolved public path must be relative: {}",
      candidate_path.display()
    ));
  }

  let normalized_relative_path = normalize_path(&candidate_path)?;
  if normalized_relative_path.as_os_str().is_empty() {
    return Err("Resolved public path cannot be empty".into());
  }

  let aindex_public_root = absolute_base_path(aindex_public_dir)?;
  let normalized_absolute_path =
    normalize_path(&aindex_public_root.join(&normalized_relative_path))?;
  ensure_within_root(
    &normalized_absolute_path,
    &aindex_public_root,
    "Resolved public path",
  )?;

  Ok(normalized_relative_path.to_string_lossy().to_string())
}

fn build_aindex_public_dir(aindex_dir: &str) -> Result<PathBuf, String> {
  let normalized = absolute_base_path(aindex_dir)?;
  normalize_path(&normalized.join("public"))
}

pub fn resolve_public_path_impl(
  _file_path: &str,
  ctx_json: &str,
  logical_path: &str,
) -> Result<String, String> {
  let ctx: ResolvePublicPathContext = serde_json::from_str(ctx_json)
    .map_err(|error| format!("Invalid resolve_public_path context JSON: {error}"))?;

  let proxied = proxy_public_path(logical_path);

  let aindex_public_dir = build_aindex_public_dir(&ctx.aindex_dir)?;
  validate_public_path_impl(&proxied, &aindex_public_dir.to_string_lossy())
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolvePublicPathContext {
  aindex_dir: String,
  #[allow(dead_code)]
  worker_path: Option<String>,
  #[allow(dead_code)]
  timeout_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
  use super::{proxy_public_path, validate_public_path_impl};
  use std::path::PathBuf;

  // -------------------------------------------------------------------------
  // proxy_public_path — prefix rules
  // -------------------------------------------------------------------------

  #[test]
  fn proxy_git_prefix_maps_to_underscore_git() {
    assert_eq!(proxy_public_path(".git/info/exclude"), "____.git/info/exclude");
    assert_eq!(proxy_public_path(".git/HEAD"), "____.git/HEAD");
    assert_eq!(proxy_public_path(".git/refs/heads/main"), "____.git/refs/heads/main");
  }

  #[test]
  fn proxy_zed_prefix_maps_to_underscore_zed() {
    assert_eq!(proxy_public_path(".zed/settings.json"), "____.zed/settings.json");
  }

  #[test]
  fn proxy_idea_prefix_maps_to_underscore_idea() {
    assert_eq!(proxy_public_path(".idea/.gitignore"), "____idea/.gitignore");
    assert_eq!(
      proxy_public_path(".idea/codeStyles/Project.xml"),
      "____idea/codeStyles/Project.xml"
    );
  }

  #[test]
  fn proxy_vscode_prefix_maps_to_underscore_vscode() {
    assert_eq!(proxy_public_path(".vscode/settings.json"), "____vscode/settings.json");
    assert_eq!(
      proxy_public_path(".vscode/extensions.json"),
      "____vscode/extensions.json"
    );
  }

  // -------------------------------------------------------------------------
  // proxy_public_path — generic dot-prefix rule
  // -------------------------------------------------------------------------

  #[test]
  fn proxy_generic_dot_file_maps_to_underscore_prefix() {
    assert_eq!(proxy_public_path(".editorconfig"), "____editorconfig");
    assert_eq!(proxy_public_path(".gitignore"), "____gitignore");
    assert_eq!(proxy_public_path(".aiignore"), "____aiignore");
    assert_eq!(proxy_public_path(".codeiumignore"), "____codeiumignore");
    assert_eq!(proxy_public_path(".cursorignore"), "____cursorignore");
    assert_eq!(proxy_public_path(".kiroignore"), "____kiroignore");
    assert_eq!(proxy_public_path(".qoderignore"), "____qoderignore");
    assert_eq!(proxy_public_path(".traeignore"), "____traeignore");
    assert_eq!(proxy_public_path(".warpindexignore"), "____warpindexignore");
  }

  #[test]
  fn proxy_generic_dot_directory_maps_to_underscore_prefix() {
    assert_eq!(
      proxy_public_path(".something/nested/path"),
      "____something/nested/path"
    );
  }

  #[test]
  fn proxy_dot_without_slash_maps_to_underscore_prefix() {
    assert_eq!(proxy_public_path(".git"), "____git");
  }

  // -------------------------------------------------------------------------
  // proxy_public_path — pass-through (no dot prefix)
  // -------------------------------------------------------------------------

  #[test]
  fn proxy_plain_paths_pass_through_unchanged() {
    assert_eq!(proxy_public_path("plain/path.txt"), "plain/path.txt");
    assert_eq!(proxy_public_path("src/app.ts"), "src/app.ts");
    assert_eq!(proxy_public_path("README.md"), "README.md");
  }

  // -------------------------------------------------------------------------
  // proxy_public_path — backslash normalization
  // -------------------------------------------------------------------------

  #[test]
  fn proxy_backslashes_normalized_to_forward_slashes() {
    assert_eq!(proxy_public_path(".git\\info/exclude"), "____.git/info/exclude");
    assert_eq!(
      proxy_public_path("path\\to\\.git\\HEAD"),
      "path/to/.git/HEAD"
    );
  }

  // -------------------------------------------------------------------------
  // proxy_public_path — edge cases
  // -------------------------------------------------------------------------

  #[test]
  fn proxy_single_dot_stays_as_dot() {
    assert_eq!(proxy_public_path("."), ".");
  }

  #[test]
  fn proxy_empty_string_stays_empty() {
    assert_eq!(proxy_public_path(""), "");
  }

  #[test]
  fn proxy_dot_embedded_in_path_is_not_transformed() {
    assert_eq!(
      proxy_public_path("path/to/.gitignore"),
      "path/to/.gitignore"
    );
  }

  // -------------------------------------------------------------------------
  // validate_public_path_impl
  // -------------------------------------------------------------------------

  #[test]
  fn validate_public_path_rejects_absolute_paths() {
    let absolute_path = if cfg!(windows) {
      String::from(r"C:\escape.txt")
    } else {
      String::from("/escape.txt")
    };

    let result = validate_public_path_impl(&absolute_path, "/tmp/workspace/aindex/public");
    assert!(result.is_err());
  }

  #[test]
  fn validate_public_path_rejects_public_root_escape() {
    let result = validate_public_path_impl("../escape.txt", "/tmp/workspace/aindex/public");
    assert!(result.is_err());
  }

  #[test]
  fn validate_public_path_rejects_backslash_parent_segments() {
    let result = validate_public_path_impl(r"..\escape.txt", "/tmp/workspace/aindex/public");
    assert!(result.is_err());
  }

  #[test]
  fn validate_public_path_normalizes_segments() -> Result<(), String> {
    let validated = validate_public_path_impl(
      "./____git/./info/../info/exclude",
      "/tmp/workspace/aindex/public",
    )?;

    let validated_path = PathBuf::from(validated);
    assert!(validated_path.ends_with(PathBuf::from("____git").join("info").join("exclude")));
    Ok(())
  }

  // -------------------------------------------------------------------------
  // proxy + validate round-trip: real aindex/public file paths
  // -------------------------------------------------------------------------

  #[test]
  fn proxy_and_validate_git_exclude_round_trip() -> Result<(), String> {
    let proxied = proxy_public_path(".git/info/exclude");
    assert_eq!(proxied, "____.git/info/exclude");

    let validated = validate_public_path_impl(&proxied, "/tmp/ws/aindex/public")?;
    assert_eq!(validated, "____.git/info/exclude");
    Ok(())
  }

  #[test]
  fn proxy_and_validate_vscode_settings_round_trip() -> Result<(), String> {
    let proxied = proxy_public_path(".vscode/settings.json");
    assert_eq!(proxied, "____vscode/settings.json");

    let validated = validate_public_path_impl(&proxied, "/tmp/ws/aindex/public")?;
    assert_eq!(validated, "____vscode/settings.json");
    Ok(())
  }

  #[test]
  fn proxy_and_validate_editorconfig_round_trip() -> Result<(), String> {
    let proxied = proxy_public_path(".editorconfig");
    assert_eq!(proxied, "____editorconfig");

    let validated = validate_public_path_impl(&proxied, "/tmp/ws/aindex/public")?;
    assert_eq!(validated, "____editorconfig");
    Ok(())
  }

  #[test]
  fn proxy_and_validate_idea_gitignore_round_trip() -> Result<(), String> {
    let proxied = proxy_public_path(".idea/.gitignore");
    assert_eq!(proxied, "____idea/.gitignore");

    let validated = validate_public_path_impl(&proxied, "/tmp/ws/aindex/public")?;
    assert_eq!(validated, "____idea/.gitignore");
    Ok(())
  }
}