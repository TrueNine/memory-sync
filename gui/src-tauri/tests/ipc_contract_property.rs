//! Property-based tests for Tauri IPC contract compatibility.
//!
//! **Feature: gui-direct-cli-crate, Property 2: Tauri IPC contract compatibility**
//! **Validates: Requirements 4.1, 4.4**
//!
//! Verifies that `PipelineResult`, `PluginExecutionResult`, and `LogEntry`
//! serialise to JSON with the correct camelCase field names and types expected
//! by the frontend TypeScript interfaces, and that round-trip
//! serialise → deserialise is lossless.

use app_lib::commands::{LogEntry, PipelineResult, PluginExecutionResult};
use proptest::prelude::*;
use serde_json::Value;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

fn arb_plugin_execution_result() -> impl Strategy<Value = PluginExecutionResult> {
    (any::<String>(), any::<i32>(), any::<i32>(), any::<bool>()).prop_map(
        |(plugin, files, dirs, dry_run)| PluginExecutionResult {
            plugin,
            files,
            dirs,
            dry_run,
        },
    )
}

fn arb_log_entry() -> impl Strategy<Value = LogEntry> {
    (
        prop::sample::select(vec!["stdout".to_string(), "stderr".to_string()]),
        prop::option::of(any::<String>()),
        any::<String>(),
    )
        .prop_map(|(stream, source, markdown)| LogEntry {
            stream,
            source,
            markdown,
        })
}

fn arb_pipeline_result() -> impl Strategy<Value = PipelineResult> {
    (
        any::<bool>(),
        any::<i32>(),
        any::<i32>(),
        any::<bool>(),
        prop::collection::vec(arb_plugin_execution_result(), 0..5),
        prop::collection::vec(arb_log_entry(), 0..5),
        prop::collection::vec(any::<String>(), 0..5),
    )
        .prop_map(
            |(success, total_files, total_dirs, dry_run, plugin_results, logs, errors)| {
                PipelineResult {
                    success,
                    total_files,
                    total_dirs,
                    dry_run,
                    command: None,
                    plugin_results,
                    logs,
                    errors,
                }
            },
        )
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

proptest! {
    /// For any randomly generated `PipelineResult`, the serialised JSON must
    /// contain all required camelCase fields with the correct JSON types.
    ///
    /// **Feature: gui-direct-cli-crate, Property 2: Tauri IPC contract compatibility**
    #[test]
    fn prop_pipeline_result_json_has_required_camel_case_fields(
        result in arb_pipeline_result()
    ) {
        let json = serde_json::to_string(&result)
            .expect("PipelineResult must serialise to JSON");
        let val: Value = serde_json::from_str(&json)
            .expect("serialised JSON must be valid");
        let obj = val.as_object().expect("PipelineResult JSON must be an object");

        // success → boolean
        prop_assert!(obj.contains_key("success"), "JSON must contain 'success'");
        prop_assert!(obj["success"].is_boolean(), "'success' must be a boolean");

        // totalFiles → number
        prop_assert!(obj.contains_key("totalFiles"), "JSON must contain 'totalFiles'");
        prop_assert!(obj["totalFiles"].is_number(), "'totalFiles' must be a number");

        // totalDirs → number
        prop_assert!(obj.contains_key("totalDirs"), "JSON must contain 'totalDirs'");
        prop_assert!(obj["totalDirs"].is_number(), "'totalDirs' must be a number");

        // dryRun → boolean
        prop_assert!(obj.contains_key("dryRun"), "JSON must contain 'dryRun'");
        prop_assert!(obj["dryRun"].is_boolean(), "'dryRun' must be a boolean");

        // pluginResults → array
        prop_assert!(obj.contains_key("pluginResults"), "JSON must contain 'pluginResults'");
        prop_assert!(obj["pluginResults"].is_array(), "'pluginResults' must be an array");

        // logs → array
        prop_assert!(obj.contains_key("logs"), "JSON must contain 'logs'");
        prop_assert!(obj["logs"].is_array(), "'logs' must be an array");

        // errors → array
        prop_assert!(obj.contains_key("errors"), "JSON must contain 'errors'");
        prop_assert!(obj["errors"].is_array(), "'errors' must be an array");
    }

    /// Round-trip: deserialise(serialise(PipelineResult)) == original.
    ///
    /// **Feature: gui-direct-cli-crate, Property 2: Tauri IPC contract compatibility**
    #[test]
    fn prop_pipeline_result_round_trip(result in arb_pipeline_result()) {
        let json = serde_json::to_string(&result)
            .expect("PipelineResult must serialise");
        let restored: PipelineResult = serde_json::from_str(&json)
            .expect("PipelineResult must deserialise from its own JSON");

        prop_assert_eq!(result.success, restored.success);
        prop_assert_eq!(result.total_files, restored.total_files);
        prop_assert_eq!(result.total_dirs, restored.total_dirs);
        prop_assert_eq!(result.dry_run, restored.dry_run);
        prop_assert_eq!(result.errors, restored.errors);
        prop_assert_eq!(result.plugin_results.len(), restored.plugin_results.len());
        prop_assert_eq!(result.logs.len(), restored.logs.len());
    }

    /// For any randomly generated `PluginExecutionResult`, the serialised JSON
    /// must contain all required camelCase fields with correct types.
    ///
    /// **Feature: gui-direct-cli-crate, Property 2: Tauri IPC contract compatibility**
    #[test]
    fn prop_plugin_execution_result_json_has_required_camel_case_fields(
        result in arb_plugin_execution_result()
    ) {
        let json = serde_json::to_string(&result)
            .expect("PluginExecutionResult must serialise to JSON");
        let val: Value = serde_json::from_str(&json)
            .expect("serialised JSON must be valid");
        let obj = val.as_object().expect("PluginExecutionResult JSON must be an object");

        prop_assert!(obj.contains_key("plugin"), "JSON must contain 'plugin'");
        prop_assert!(obj["plugin"].is_string(), "'plugin' must be a string");

        prop_assert!(obj.contains_key("files"), "JSON must contain 'files'");
        prop_assert!(obj["files"].is_number(), "'files' must be a number");

        prop_assert!(obj.contains_key("dirs"), "JSON must contain 'dirs'");
        prop_assert!(obj["dirs"].is_number(), "'dirs' must be a number");

        prop_assert!(obj.contains_key("dryRun"), "JSON must contain 'dryRun'");
        prop_assert!(obj["dryRun"].is_boolean(), "'dryRun' must be a boolean");
    }

    /// Round-trip: deserialise(serialise(PluginExecutionResult)) == original.
    ///
    /// **Feature: gui-direct-cli-crate, Property 2: Tauri IPC contract compatibility**
    #[test]
    fn prop_plugin_execution_result_round_trip(result in arb_plugin_execution_result()) {
        let json = serde_json::to_string(&result)
            .expect("PluginExecutionResult must serialise");
        let restored: PluginExecutionResult = serde_json::from_str(&json)
            .expect("PluginExecutionResult must deserialise from its own JSON");

        prop_assert_eq!(result.plugin, restored.plugin);
        prop_assert_eq!(result.files, restored.files);
        prop_assert_eq!(result.dirs, restored.dirs);
        prop_assert_eq!(result.dry_run, restored.dry_run);
    }

    /// For any randomly generated `LogEntry`, the serialised JSON must contain
    /// all required camelCase fields with correct types.
    ///
    /// **Feature: gui-direct-cli-crate, Property 2: Tauri IPC contract compatibility**
    #[test]
    fn prop_log_entry_json_has_required_camel_case_fields(
        entry in arb_log_entry()
    ) {
        let json = serde_json::to_string(&entry)
            .expect("LogEntry must serialise to JSON");
        let val: Value = serde_json::from_str(&json)
            .expect("serialised JSON must be valid");
        let obj = val.as_object().expect("LogEntry JSON must be an object");

        prop_assert!(obj.contains_key("stream"), "JSON must contain 'stream'");
        prop_assert!(obj["stream"].is_string(), "'stream' must be a string");

        prop_assert!(obj.contains_key("markdown"), "JSON must contain 'markdown'");
        prop_assert!(obj["markdown"].is_string(), "'markdown' must be a string");
    }

    /// Round-trip: deserialise(serialise(LogEntry)) == original.
    ///
    /// **Feature: gui-direct-cli-crate, Property 2: Tauri IPC contract compatibility**
    #[test]
    fn prop_log_entry_round_trip(entry in arb_log_entry()) {
        let json = serde_json::to_string(&entry)
            .expect("LogEntry must serialise");
        let restored: LogEntry = serde_json::from_str(&json)
            .expect("LogEntry must deserialise from its own JSON");

        prop_assert_eq!(entry.stream, restored.stream);
        prop_assert_eq!(entry.source, restored.source);
        prop_assert_eq!(entry.markdown, restored.markdown);
    }
}
