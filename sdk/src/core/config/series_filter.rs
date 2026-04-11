//! Series-based filtering helpers (NAPI-exported).
//!
//! Mirrors the pure-TS implementations in `seriesFilter.ts`.
//! Each function is gated behind the `napi` feature so the crate
//! still compiles as a plain Rust library without Node bindings.

use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// Core logic (always available)
// ---------------------------------------------------------------------------

/// Compute the effective includeSeries as the set union of two optional arrays.
/// Returns an empty vec when both are `None` (no filtering — all items pass).
pub fn resolve_effective_include_series_core(
  top_level: Option<&[String]>,
  type_specific: Option<&[String]>,
) -> Vec<String> {
  match (top_level, type_specific) {
    (None, None) => Vec::new(),
    (Some(a), None) => a
      .iter()
      .collect::<HashSet<_>>()
      .into_iter()
      .cloned()
      .collect(),
    (None, Some(b)) => b
      .iter()
      .collect::<HashSet<_>>()
      .into_iter()
      .cloned()
      .collect(),
    (Some(a), Some(b)) => {
      let mut set = HashSet::new();
      for s in a.iter().chain(b.iter()) {
        set.insert(s.clone());
      }
      set.into_iter().collect()
    }
  }
}

/// Determine whether a prompt item should be included.
///
/// - `None` seri_name → always included
/// - empty effective list → always included (no filtering configured)
/// - single string → included iff member of the list
/// - array → included iff any element intersects the list
pub fn matches_series_core(
  seri_name: Option<&SeriName>,
  effective_include_series: &[String],
) -> bool {
  let seri = match seri_name {
    None => return true,
    Some(s) => s,
  };
  if effective_include_series.is_empty() {
    return true;
  }
  let set: HashSet<&str> = effective_include_series
    .iter()
    .map(String::as_str)
    .collect();
  match seri {
    SeriName::Single(s) => set.contains(s.as_str()),
    SeriName::Multiple(arr) => arr.iter().any(|s| set.contains(s.as_str())),
  }
}

/// Deep-merge two optional subSeries records.
/// For each key present in either record the result is the set union of both
/// value arrays. Returns an empty map when both are `None`.
pub fn resolve_sub_series_core(
  top_level: Option<&HashMap<String, Vec<String>>>,
  type_specific: Option<&HashMap<String, Vec<String>>>,
) -> HashMap<String, Vec<String>> {
  match (top_level, type_specific) {
    (None, None) => HashMap::new(),
    (Some(a), None) => a.clone(),
    (None, Some(b)) => b.clone(),
    (Some(a), Some(b)) => {
      let mut merged = a.clone();
      for (key, values) in b {
        let entry = merged.entry(key.clone()).or_default();
        let mut set: HashSet<String> = entry.drain(..).collect();
        for v in values {
          set.insert(v.clone());
        }
        *entry = set.into_iter().collect();
      }
      merged
    }
  }
}

/// Wrapper enum for the `seriName` parameter (string or string array).
pub enum SeriName {
  Single(String),
  Multiple(Vec<String>),
}

// ---------------------------------------------------------------------------
// NAPI binding layer
// ---------------------------------------------------------------------------

#[cfg(feature = "napi")]
mod napi_binding {
  use std::collections::HashMap;

  use napi::Either;
  use napi_derive::napi;

  use super::*;

  /// Determine whether a prompt item should be included based on its
  /// `seriName` and the effective `includeSeries` list.
  #[napi]
  pub fn matches_series(
    seri_name: Option<Either<String, Vec<String>>>,
    effective_include_series: Vec<String>,
  ) -> bool {
    let seri = seri_name.map(|e| match e {
      Either::A(s) => SeriName::Single(s),
      Either::B(arr) => SeriName::Multiple(arr),
    });
    matches_series_core(seri.as_ref(), &effective_include_series)
  }

  /// Compute the effective includeSeries as the set union of top-level and
  /// type-specific arrays.
  #[napi]
  pub fn resolve_effective_include_series(
    top_level: Option<Vec<String>>,
    type_specific: Option<Vec<String>>,
  ) -> Vec<String> {
    resolve_effective_include_series_core(top_level.as_deref(), type_specific.as_deref())
  }

  /// Deep-merge two optional subSeries records.
  #[napi]
  pub fn resolve_sub_series(
    top_level: Option<HashMap<String, Vec<String>>>,
    type_specific: Option<HashMap<String, Vec<String>>>,
  ) -> HashMap<String, Vec<String>> {
    resolve_sub_series_core(top_level.as_ref(), type_specific.as_ref())
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_resolve_effective_both_none() {
    let result = resolve_effective_include_series_core(None, None);
    assert!(result.is_empty());
  }

  #[test]
  fn test_resolve_effective_union() {
    let a = vec!["x".into(), "y".into()];
    let b = vec!["y".into(), "z".into()];
    let mut result = resolve_effective_include_series_core(Some(&a), Some(&b));
    result.sort();
    assert_eq!(result, vec!["x", "y", "z"]);
  }

  #[test]
  fn test_matches_series_none_seri() {
    assert!(matches_series_core(None, &["a".into()]));
  }

  #[test]
  fn test_matches_series_empty_list() {
    let seri = SeriName::Single("a".into());
    assert!(matches_series_core(Some(&seri), &[]));
  }

  #[test]
  fn test_matches_series_string_hit() {
    let seri = SeriName::Single("a".into());
    assert!(matches_series_core(Some(&seri), &["a".into(), "b".into()]));
  }

  #[test]
  fn test_matches_series_string_miss() {
    let seri = SeriName::Single("c".into());
    assert!(!matches_series_core(Some(&seri), &["a".into(), "b".into()]));
  }

  #[test]
  fn test_matches_series_array_intersection() {
    let seri = SeriName::Multiple(vec!["c".into(), "a".into()]);
    assert!(matches_series_core(Some(&seri), &["a".into(), "b".into()]));
  }

  #[test]
  fn test_matches_series_array_no_intersection() {
    let seri = SeriName::Multiple(vec!["c".into(), "d".into()]);
    assert!(!matches_series_core(Some(&seri), &["a".into(), "b".into()]));
  }

  #[test]
  fn test_resolve_sub_series_both_none() {
    let result = resolve_sub_series_core(None, None);
    assert!(result.is_empty());
  }

  #[test]
  fn test_resolve_sub_series_merge() {
    let mut a = HashMap::new();
    a.insert("k".into(), vec!["v1".into()]);
    let mut b = HashMap::new();
    b.insert("k".into(), vec!["v1".into(), "v2".into()]);
    b.insert("k2".into(), vec!["v3".into()]);

    let result = resolve_sub_series_core(Some(&a), Some(&b));
    assert_eq!(result.len(), 2);
    let mut k_vals = result["k"].clone();
    k_vals.sort();
    assert_eq!(k_vals, vec!["v1", "v2"]);
    assert_eq!(result["k2"], vec!["v3"]);
  }
}
