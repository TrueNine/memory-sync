/// Unit tests verifying that sidecar-related code has been removed from
/// `gui/src-tauri/src/commands.rs`.
///
/// Requirements: 3.1, 3.2, 3.3, 3.4
///
/// These tests read the source file at compile time (via `include_str!`) and
/// assert that the removed function definitions are no longer present.
const COMMANDS_SRC: &str = include_str!("../src/commands.rs");

/// Helper: assert a `fn <name>` definition is absent from the source.
fn assert_fn_absent(source: &str, fn_name: &str) {
    // Match both `fn name(` and `fn name<` to catch generic variants.
    let pattern_paren = format!("fn {}(", fn_name);
    let pattern_angle = format!("fn {}<", fn_name);
    assert!(
        !source.contains(&pattern_paren) && !source.contains(&pattern_angle),
        "Sidecar function `{fn_name}` should have been removed from commands.rs but was found"
    );
}

/// Requirement 3.1 — `resolve_cli_path` and its helpers must be removed.
#[test]
fn test_resolve_cli_path_removed() {
    assert_fn_absent(COMMANDS_SRC, "resolve_cli_path");
}

/// Requirement 3.2 — `run_cli` (subprocess invocation) must be removed.
#[test]
fn test_run_cli_removed() {
    assert_fn_absent(COMMANDS_SRC, "run_cli");
}

/// Requirement 3.3 — `check_cli` Tauri command must be removed.
#[test]
fn test_check_cli_removed() {
    assert_fn_absent(COMMANDS_SRC, "check_cli");
}

/// Requirement 3.4 — stdout log-parsing helpers must be removed.
#[test]
fn test_strip_ansi_removed() {
    assert_fn_absent(COMMANDS_SRC, "strip_ansi");
}

#[test]
fn test_parse_log_line_removed() {
    assert_fn_absent(COMMANDS_SRC, "parse_log_line");
}

#[test]
fn test_parse_all_logs_removed() {
    assert_fn_absent(COMMANDS_SRC, "parse_all_logs");
}
