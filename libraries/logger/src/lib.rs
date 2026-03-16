#![deny(clippy::all)]

//! Structured logger with terminal-friendly text output and JSON fallback.
//!
//! Non-terminal output format: `{"$":["HH:MM:SS.mmm","LEVEL","namespace"],"_":{...payload}}`
//!
//! This logger is designed to be consumed by both CLI users and GUI tooling.
//! When writing to a terminal, it prints compact readable text.
//! When stdout/stderr are piped, it emits single-line JSON records for parsing.

use chrono::{Local, Timelike};
use std::env;
use std::io::{self, IsTerminal};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{LazyLock, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Silent,
    Fatal,
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl LogLevel {
    fn priority(self) -> u8 {
        match self {
            Self::Silent => 0,
            Self::Fatal => 1,
            Self::Error => 2,
            Self::Warn => 3,
            Self::Info => 4,
            Self::Debug => 5,
            Self::Trace => 6,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Silent => "silent",
            Self::Fatal => "fatal",
            Self::Error => "error",
            Self::Warn => "warn",
            Self::Info => "info",
            Self::Debug => "debug",
            Self::Trace => "trace",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "silent" => Some(Self::Silent),
            "fatal" => Some(Self::Fatal),
            "error" => Some(Self::Error),
            "warn" => Some(Self::Warn),
            "info" => Some(Self::Info),
            "debug" => Some(Self::Debug),
            "trace" => Some(Self::Trace),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// LogRecord (the structured return value)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct LogRecord {
    #[serde(rename = "$")]
    pub meta: (String, String, String),
    #[serde(rename = "_")]
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoggerDiagnosticInput {
    pub code: String,
    pub title: String,
    pub root_cause: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exact_fix: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub possible_fixes: Option<Vec<Vec<String>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Map<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoggerDiagnosticRecord {
    pub code: String,
    pub title: String,
    pub root_cause: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exact_fix: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub possible_fixes: Option<Vec<Vec<String>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Map<String, Value>>,
    pub level: String,
    pub namespace: String,
    pub copy_text: Vec<String>,
}

// ---------------------------------------------------------------------------
// Global log level
// ---------------------------------------------------------------------------

static GLOBAL_LOG_LEVEL: AtomicU8 = AtomicU8::new(255); // 255 = unset
static BUFFERED_DIAGNOSTICS: LazyLock<Mutex<Vec<LoggerDiagnosticRecord>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

/// Set the global log level for all loggers.
pub fn set_global_log_level(level: LogLevel) {
    GLOBAL_LOG_LEVEL.store(level.priority(), Ordering::Relaxed);
}

/// Get the current global log level.
pub fn get_global_log_level() -> Option<LogLevel> {
    let v = GLOBAL_LOG_LEVEL.load(Ordering::Relaxed);
    if v == 255 { None } else { priority_to_level(v) }
}

pub fn clear_buffered_diagnostics() {
    if let Ok(mut buffered) = BUFFERED_DIAGNOSTICS.lock() {
        buffered.clear();
    }
}

pub fn drain_buffered_diagnostics() -> Vec<LoggerDiagnosticRecord> {
    match BUFFERED_DIAGNOSTICS.lock() {
        Ok(mut buffered) => std::mem::take(&mut *buffered),
        Err(_) => Vec::new(),
    }
}

fn priority_to_level(p: u8) -> Option<LogLevel> {
    match p {
        0 => Some(LogLevel::Silent),
        1 => Some(LogLevel::Fatal),
        2 => Some(LogLevel::Error),
        3 => Some(LogLevel::Warn),
        4 => Some(LogLevel::Info),
        5 => Some(LogLevel::Debug),
        6 => Some(LogLevel::Trace),
        _ => None,
    }
}

fn resolve_log_level(explicit: Option<LogLevel>) -> LogLevel {
    if let Some(l) = explicit {
        return l;
    }
    if let Some(l) = get_global_log_level() {
        return l;
    }
    if let Ok(env_val) = std::env::var("LOG_LEVEL") {
        if let Some(l) = LogLevel::from_str_loose(&env_val) {
            return l;
        }
    }
    LogLevel::Info
}

// ---------------------------------------------------------------------------
// JSON formatting
// ---------------------------------------------------------------------------

fn to_plain_json(value: &Value) -> String {
    match serde_json::to_string(value) {
        Ok(serialized) => serialized,
        Err(_) => r#"{"error":"failed to serialize output"}"#.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------

#[allow(dead_code)]
fn timestamp() -> String {
    let now = Local::now();
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        now.hour(),
        now.minute(),
        now.second(),
        now.timestamp_subsec_millis()
    )
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

fn validate_non_empty_lines(field_name: &str, lines: &[String], errors: &mut Vec<String>) {
    if lines.is_empty() {
        errors.push(format!("{field_name} must contain at least one line"));
    }
}

fn validate_diagnostic_input(input: &LoggerDiagnosticInput) -> Result<(), Vec<String>> {
    let mut errors: Vec<String> = Vec::new();

    if input.code.trim().is_empty() {
        errors.push("code must be a non-empty string".to_string());
    }
    if input.title.trim().is_empty() {
        errors.push("title must be a non-empty string".to_string());
    }
    validate_non_empty_lines("rootCause", &input.root_cause, &mut errors);

    if let Some(lines) = &input.exact_fix {
        validate_non_empty_lines("exactFix", lines, &mut errors);
    }

    if let Some(fixes) = &input.possible_fixes {
        if fixes.is_empty() {
            errors.push("possibleFixes must contain at least one fix when provided".to_string());
        }
        for (index, lines) in fixes.iter().enumerate() {
            if lines.is_empty() {
                errors.push(format!(
                    "possibleFixes[{index}] must contain at least one line"
                ));
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn build_payload(message: &Value, meta: Option<&Value>) -> Value {
    let Some(meta_val) = meta else {
        return message.clone();
    };

    if meta_val.as_object().is_some_and(|object| object.is_empty()) {
        return message.clone();
    }

    let message_str = match message {
        Value::String(s) => s.as_str(),
        _ => "",
    };

    if message_str.is_empty() {
        return meta_val.clone();
    }

    if meta_val.is_object() {
        let mut map = serde_json::Map::new();
        map.insert(message_str.to_string(), meta_val.clone());
        return Value::Object(map);
    }

    let mut map = serde_json::Map::new();
    map.insert(
        "message".to_string(),
        Value::String(message_str.to_string()),
    );
    map.insert("meta".to_string(), meta_val.clone());
    Value::Object(map)
}

fn append_section(
    lines: &mut Vec<String>,
    title: &str,
    entries: &[String],
    numbered: Option<usize>,
) {
    if entries.is_empty() {
        return;
    }

    if !lines.is_empty() {
        lines.push(String::new());
    }

    if !title.is_empty() {
        lines.push(title.to_string());
    }

    match numbered {
        Some(number) => {
            let mut iter = entries.iter();
            if let Some(first) = iter.next() {
                lines.push(format!("{number}. {first}"));
            }
            for entry in iter {
                lines.push(format!("   {entry}"));
            }
        }
        None => {
            for entry in entries {
                lines.push(format!("- {entry}"));
            }
        }
    }
}

fn value_to_pretty_lines(value: &Value) -> Vec<String> {
    match serde_json::to_string_pretty(value) {
        Ok(serialized) => serialized.lines().map(ToString::to_string).collect(),
        Err(_) => vec![
            "{".to_string(),
            r#"  "error": "failed to serialize context""#.to_string(),
            "}".to_string(),
        ],
    }
}

fn build_copy_text(record: &LoggerDiagnosticRecord) -> Vec<String> {
    let mut lines = vec![format!("[{}] {}", record.code, record.title)];

    append_section(&mut lines, "Root Cause", &record.root_cause, None);

    if let Some(exact_fix) = &record.exact_fix {
        append_section(&mut lines, "Exact Fix", exact_fix, None);
    }

    if let Some(possible_fixes) = &record.possible_fixes {
        if !possible_fixes.is_empty() {
            if !lines.is_empty() {
                lines.push(String::new());
            }
            lines.push("Possible Fixes".to_string());
            for (index, fix) in possible_fixes.iter().enumerate() {
                let mut iter = fix.iter();
                if let Some(first) = iter.next() {
                    lines.push(format!("{}. {}", index + 1, first));
                }
                for entry in iter {
                    lines.push(format!("   {entry}"));
                }
            }
        }
    }

    if let Some(details) = &record.details {
        if !details.is_empty() {
            if !lines.is_empty() {
                lines.push(String::new());
            }
            lines.push("Context".to_string());
            lines.extend(value_to_pretty_lines(&Value::Object(details.clone())));
        }
    }

    lines
}

fn diagnostic_record_from_input(
    namespace: &str,
    level: LogLevel,
    input: LoggerDiagnosticInput,
) -> LoggerDiagnosticRecord {
    let mut record = LoggerDiagnosticRecord {
        code: input.code.trim().to_string(),
        title: input.title.trim().to_string(),
        root_cause: input.root_cause,
        exact_fix: input.exact_fix,
        possible_fixes: input.possible_fixes,
        details: input.details,
        level: level.as_str().to_string(),
        namespace: namespace.to_string(),
        copy_text: Vec::new(),
    };
    record.copy_text = build_copy_text(&record);
    record
}

fn invalid_diagnostic_record(
    namespace: &str,
    level: LogLevel,
    raw_payload: Value,
    validation_errors: &[String],
) -> LoggerDiagnosticRecord {
    let mut details = Map::new();
    details.insert("rawPayload".to_string(), raw_payload);
    details.insert(
        "validationErrors".to_string(),
        Value::Array(
            validation_errors
                .iter()
                .map(|entry| Value::String(entry.clone()))
                .collect(),
        ),
    );

    let mut record = LoggerDiagnosticRecord {
        code: "LOGGER_DIAGNOSTIC_SCHEMA_INVALID".to_string(),
        title: "Logger diagnostic payload is invalid".to_string(),
        root_cause: vec![
            "The logger received a warn/error/fatal payload that does not match the required diagnostic schema.".to_string(),
            format!("Validation issues: {}", validation_errors.join("; ")),
        ],
        exact_fix: Some(vec![
            "Pass a diagnostic object with non-empty code, title, and rootCause fields.".to_string(),
            "Keep exactFix and each possibleFixes entry as non-empty string arrays when they are present.".to_string(),
        ]),
        possible_fixes: None,
        details: Some(details),
        level: level.as_str().to_string(),
        namespace: namespace.to_string(),
        copy_text: Vec::new(),
    };
    record.copy_text = build_copy_text(&record);
    record
}

fn parse_diagnostic_input(
    namespace: &str,
    level: LogLevel,
    diagnostic: Value,
) -> LoggerDiagnosticRecord {
    let parsed = serde_json::from_value::<LoggerDiagnosticInput>(diagnostic.clone());
    match parsed {
        Ok(input) => match validate_diagnostic_input(&input) {
            Ok(()) => diagnostic_record_from_input(namespace, level, input),
            Err(validation_errors) => {
                invalid_diagnostic_record(namespace, level, diagnostic, &validation_errors)
            }
        },
        Err(error) => invalid_diagnostic_record(
            namespace,
            level,
            diagnostic,
            &[format!("Diagnostic payload could not be parsed: {error}")],
        ),
    }
}

fn serialize_payload(value: impl Serialize) -> Value {
    match serde_json::to_value(value) {
        Ok(serialized) => serialized,
        Err(error) => Value::Object(Map::from_iter([
            (
                "code".to_string(),
                Value::String("LOGGER_SERIALIZATION_FAILED".to_string()),
            ),
            (
                "title".to_string(),
                Value::String("Logger payload serialization failed".to_string()),
            ),
            ("error".to_string(), Value::String(error.to_string())),
        ])),
    }
}

fn push_buffered_diagnostic(record: &LoggerDiagnosticRecord) {
    if let Ok(mut buffered) = BUFFERED_DIAGNOSTICS.lock() {
        buffered.push(record.clone());
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutputFormat {
    Terminal,
    StructuredJson,
}

fn writes_to_stderr(level: LogLevel) -> bool {
    matches!(
        level,
        LogLevel::Error | LogLevel::Fatal | LogLevel::Warn | LogLevel::Debug | LogLevel::Trace
    )
}

fn output_format_from_env() -> Option<OutputFormat> {
    let raw = env::var("TNMSC_LOG_FORMAT").ok()?;
    match raw.trim().to_ascii_lowercase().as_str() {
        "terminal" => Some(OutputFormat::Terminal),
        "json" => Some(OutputFormat::StructuredJson),
        _ => None,
    }
}

fn detect_output_format(level: LogLevel) -> OutputFormat {
    if let Some(output_format) = output_format_from_env() {
        return output_format;
    }

    if writes_to_stderr(level) {
        if io::stderr().is_terminal() {
            OutputFormat::Terminal
        } else {
            OutputFormat::StructuredJson
        }
    } else if io::stdout().is_terminal() {
        OutputFormat::Terminal
    } else {
        OutputFormat::StructuredJson
    }
}

fn extract_copy_text(payload: &Value) -> Option<Vec<String>> {
    let entries = payload.as_object()?.get("copyText")?.as_array()?;
    entries
        .iter()
        .map(|entry| entry.as_str().map(ToString::to_string))
        .collect()
}

fn render_terminal_value(value: &Value) -> String {
    match value {
        Value::String(inner) => inner.clone(),
        _ => to_plain_json(value),
    }
}

fn render_terminal_message(payload: &Value) -> String {
    match payload {
        Value::String(inner) => inner.clone(),
        Value::Object(items) => {
            if let Some(message) = items.get("message").and_then(Value::as_str) {
                return match items.get("meta") {
                    Some(meta) => format!("{message} {}", render_terminal_value(meta)),
                    None => message.to_string(),
                };
            }

            if items.len() == 1 {
                if let Some((key, value)) = items.iter().next() {
                    return format!("{key} {}", render_terminal_value(value));
                }
            }

            to_plain_json(payload)
        }
        _ => to_plain_json(payload),
    }
}

fn render_terminal_output(
    timestamp: &str,
    level: LogLevel,
    namespace: &str,
    payload: &Value,
    pretty: bool,
) -> String {
    let prefix = format!(
        "{timestamp} {:<5} {namespace}",
        level.as_str().to_ascii_uppercase()
    );

    if pretty {
        if let Some(copy_text) = extract_copy_text(payload) {
            let mut iter = copy_text.into_iter();
            if let Some(first_line) = iter.next() {
                let mut lines = vec![format!("{prefix} {first_line}")];
                for line in iter {
                    if line.is_empty() {
                        lines.push(String::new());
                    } else {
                        lines.push(format!("  {line}"));
                    }
                }
                return lines.join("\n");
            }
        }
    }

    let message = render_terminal_message(payload);
    if message.is_empty() {
        prefix
    } else {
        format!("{prefix} {message}")
    }
}

fn build_structured_output(
    timestamp: &str,
    level: LogLevel,
    namespace: &str,
    payload: &Value,
) -> Value {
    let base_meta = Value::Array(vec![
        Value::String(timestamp.to_string()),
        Value::String(level.as_str().to_ascii_uppercase()),
        Value::String(namespace.to_string()),
    ]);

    Value::Object(Map::from_iter([
        ("$".to_string(), base_meta),
        ("_".to_string(), payload.clone()),
    ]))
}

fn render_output(
    output_format: OutputFormat,
    timestamp: &str,
    level: LogLevel,
    namespace: &str,
    payload: &Value,
    pretty: bool,
) -> String {
    match output_format {
        OutputFormat::Terminal => render_terminal_output(timestamp, level, namespace, payload, pretty),
        OutputFormat::StructuredJson => {
            to_plain_json(&build_structured_output(timestamp, level, namespace, payload))
        }
    }
}

// ---------------------------------------------------------------------------
// Format and print
// ---------------------------------------------------------------------------

fn print_output(level: LogLevel, output: &str) {
    if writes_to_stderr(level) {
        eprintln!("{}", output);
    } else {
        println!("{}", output);
    }
}

fn emit_log_record(level: LogLevel, namespace: &str, payload: Value, pretty: bool) -> LogRecord {
    let ts = timestamp();

    let record = LogRecord {
        meta: (
            ts.clone(),
            level.as_str().to_string(),
            namespace.to_string(),
        ),
        payload: payload.clone(),
    };

    let output = render_output(
        detect_output_format(level),
        &ts,
        level,
        namespace,
        &payload,
        pretty,
    );
    print_output(level, &output);
    record
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

pub struct Logger {
    namespace: String,
    level: LogLevel,
}

impl Logger {
    pub fn error(&self, diagnostic: LoggerDiagnosticInput) -> Option<LogRecord> {
        self.log_diagnostic(LogLevel::Error, serialize_payload(diagnostic))
    }

    pub fn warn(&self, diagnostic: LoggerDiagnosticInput) -> Option<LogRecord> {
        self.log_diagnostic(LogLevel::Warn, serialize_payload(diagnostic))
    }

    pub fn info(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log_message(LogLevel::Info, message.into(), meta)
    }

    pub fn debug(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log_message(LogLevel::Debug, message.into(), meta)
    }

    pub fn trace(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log_message(LogLevel::Trace, message.into(), meta)
    }

    pub fn fatal(&self, diagnostic: LoggerDiagnosticInput) -> Option<LogRecord> {
        self.log_diagnostic(LogLevel::Fatal, serialize_payload(diagnostic))
    }

    fn should_emit(&self, level: LogLevel) -> bool {
        level.priority() <= self.level.priority()
    }

    fn should_buffer_diagnostic(&self, level: LogLevel) -> bool {
        self.should_emit(level) || self.level == LogLevel::Silent
    }

    fn log_message(
        &self,
        level: LogLevel,
        message: Value,
        meta: Option<Value>,
    ) -> Option<LogRecord> {
        if level.priority() > self.level.priority() {
            return None;
        }
        let payload = build_payload(&message, meta.as_ref());
        Some(emit_log_record(level, &self.namespace, payload, false))
    }

    fn log_diagnostic(&self, level: LogLevel, diagnostic: Value) -> Option<LogRecord> {
        let record = parse_diagnostic_input(&self.namespace, level, diagnostic);

        if self.should_buffer_diagnostic(level) {
            push_buffered_diagnostic(&record);
        }

        if !self.should_emit(level) {
            return None;
        }

        Some(emit_log_record(
            level,
            &self.namespace,
            serialize_payload(&record),
            true,
        ))
    }
}

/// Create a new logger with the given namespace and optional log level.
pub fn create_logger(namespace: &str, log_level: Option<LogLevel>) -> Logger {
    Logger {
        namespace: namespace.to_string(),
        level: resolve_log_level(log_level),
    }
}

// ---------------------------------------------------------------------------
// Convenience macros
// ---------------------------------------------------------------------------

#[macro_export]
macro_rules! log_info {
    ($logger:expr, $msg:expr) => {
        $logger.info(serde_json::Value::String($msg.to_string()), None)
    };
    ($logger:expr, $msg:expr, $meta:expr) => {
        $logger.info(serde_json::Value::String($msg.to_string()), Some($meta))
    };
}

#[macro_export]
macro_rules! log_error {
    ($logger:expr, $diagnostic:expr) => {
        $logger.error($diagnostic)
    };
}

#[macro_export]
macro_rules! log_warn {
    ($logger:expr, $diagnostic:expr) => {
        $logger.warn($diagnostic)
    };
}

#[macro_export]
macro_rules! log_debug {
    ($logger:expr, $msg:expr) => {
        $logger.debug(serde_json::Value::String($msg.to_string()), None)
    };
    ($logger:expr, $msg:expr, $meta:expr) => {
        $logger.debug(serde_json::Value::String($msg.to_string()), Some($meta))
    };
}

// ===========================================================================
// NAPI binding layer (only compiled with --features napi)
// ===========================================================================

#[cfg(feature = "napi")]
mod napi_binding {
    use super::{
        LogLevel, Logger, clear_buffered_diagnostics as core_clear_buffered,
        create_logger as core_create_logger, drain_buffered_diagnostics as core_drain_buffered,
        get_global_log_level as core_get_global, set_global_log_level as core_set_global,
    };
    use napi_derive::napi;
    use serde_json::Value;

    fn parse_level(s: &str) -> Option<LogLevel> {
        LogLevel::from_str_loose(s)
    }

    fn parse_meta(meta_json: Option<String>) -> Option<Value> {
        let meta = meta_json?;
        match serde_json::from_str(&meta) {
            Ok(value) => Some(value),
            Err(_) => Some(Value::String(meta)),
        }
    }

    fn parse_diagnostic(diagnostic_json: String) -> Value {
        match serde_json::from_str(&diagnostic_json) {
            Ok(value) => value,
            Err(_) => Value::String(diagnostic_json),
        }
    }

    fn parse_level_or_error(level: &str) -> napi::Result<LogLevel> {
        parse_level(level)
            .ok_or_else(|| napi::Error::from_reason(format!("Invalid log level: {level}")))
    }

    #[napi]
    pub struct NapiLogger {
        inner: Logger,
    }

    #[napi]
    impl NapiLogger {
        #[napi]
        pub fn log(
            &self,
            level: String,
            message: String,
            meta_json: Option<String>,
        ) -> napi::Result<()> {
            let level = parse_level_or_error(&level)?;
            let meta = parse_meta(meta_json);
            self.inner.log_message(level, Value::String(message), meta);
            Ok(())
        }

        #[napi]
        pub fn log_diagnostic(&self, level: String, diagnostic_json: String) -> napi::Result<()> {
            let level = parse_level_or_error(&level)?;
            self.inner
                .log_diagnostic(level, parse_diagnostic(diagnostic_json));
            Ok(())
        }
    }

    #[napi]
    pub fn create_logger(namespace: String, level: Option<String>) -> napi::Result<NapiLogger> {
        let log_level = match level {
            Some(level) => Some(parse_level_or_error(&level)?),
            None => None,
        };

        Ok(NapiLogger {
            inner: core_create_logger(&namespace, log_level),
        })
    }

    #[napi]
    pub fn set_global_log_level(level: String) -> napi::Result<()> {
        core_set_global(parse_level_or_error(&level)?);
        Ok(())
    }

    #[napi]
    pub fn get_global_log_level() -> Option<String> {
        core_get_global().map(|l| l.as_str().to_string())
    }

    #[napi]
    pub fn clear_buffered_diagnostics() {
        core_clear_buffered();
    }

    #[napi]
    pub fn drain_buffered_diagnostics() -> String {
        match serde_json::to_string(&core_drain_buffered()) {
            Ok(serialized) => serialized,
            Err(_) => "[]".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_priority() {
        assert!(LogLevel::Silent.priority() < LogLevel::Fatal.priority());
        assert!(LogLevel::Fatal.priority() < LogLevel::Error.priority());
        assert!(LogLevel::Error.priority() < LogLevel::Warn.priority());
        assert!(LogLevel::Warn.priority() < LogLevel::Info.priority());
        assert!(LogLevel::Info.priority() < LogLevel::Debug.priority());
        assert!(LogLevel::Debug.priority() < LogLevel::Trace.priority());
    }

    #[test]
    fn test_log_level_from_str() {
        assert_eq!(LogLevel::from_str_loose("info"), Some(LogLevel::Info));
        assert_eq!(LogLevel::from_str_loose("INFO"), Some(LogLevel::Info));
        assert_eq!(LogLevel::from_str_loose("Debug"), Some(LogLevel::Debug));
        assert_eq!(LogLevel::from_str_loose("unknown"), None);
    }

    #[test]
    fn test_to_plain_json() {
        let val = Value::Object(Map::from_iter([(
            "hello".to_string(),
            Value::String("world".to_string()),
        )]));
        assert_eq!(to_plain_json(&val), r#"{"hello":"world"}"#);
    }

    #[test]
    fn test_create_logger_default_level() {
        let logger = create_logger("test", None);
        assert_eq!(logger.level, LogLevel::Info);
    }

    #[test]
    fn test_logger_filters_by_level() {
        let logger = create_logger("test", Some(LogLevel::Warn));
        assert!(
            logger
                .log_message(LogLevel::Info, Value::String("hi".into()), None)
                .is_none()
        );
        assert!(
            logger
                .log_message(LogLevel::Error, Value::String("err".into()), None)
                .is_some()
        );
    }

    #[test]
    fn test_build_payload_uses_meta_when_message_is_empty() {
        let payload = build_payload(
            &Value::String(String::new()),
            Some(&serde_json::json!([1, 2, 3])),
        );
        assert_eq!(payload, serde_json::json!([1, 2, 3]));
    }

    #[test]
    fn test_build_payload_wraps_non_object_meta_for_named_message() {
        let payload = build_payload(
            &Value::String("hello".into()),
            Some(&serde_json::json!(["x"])),
        );
        assert_eq!(
            payload,
            serde_json::json!({
                "message": "hello",
                "meta": ["x"],
            })
        );
    }

    #[test]
    fn test_global_log_level() {
        set_global_log_level(LogLevel::Debug);
        assert_eq!(get_global_log_level(), Some(LogLevel::Debug));
        GLOBAL_LOG_LEVEL.store(255, Ordering::Relaxed);
    }

    #[test]
    fn test_validate_diagnostic_input_rejects_empty_root_cause() {
        let diagnostic = LoggerDiagnosticInput {
            code: "TEST".to_string(),
            title: "Broken diagnostic".to_string(),
            root_cause: Vec::new(),
            exact_fix: None,
            possible_fixes: None,
            details: None,
        };

        assert!(validate_diagnostic_input(&diagnostic).is_err());
    }

    #[test]
    fn test_build_copy_text_includes_expected_sections() {
        let record = diagnostic_record_from_input(
            "logger-test",
            LogLevel::Error,
            LoggerDiagnosticInput {
                code: "TEST_ERROR".to_string(),
                title: "Example diagnostic".to_string(),
                root_cause: vec!["The config file is missing.".to_string()],
                exact_fix: Some(vec![
                    "Create the config file before running again.".to_string(),
                ]),
                possible_fixes: Some(vec![vec![
                    "Restore the file from version control.".to_string(),
                    "Re-run the setup command if the file is generated.".to_string(),
                ]]),
                details: Some(Map::from_iter([(
                    "path".to_string(),
                    Value::String("/tmp/example.json".to_string()),
                )])),
            },
        );

        assert_eq!(record.copy_text[0], "[TEST_ERROR] Example diagnostic");
        assert!(record.copy_text.contains(&"Root Cause".to_string()));
        assert!(record.copy_text.contains(&"Exact Fix".to_string()));
        assert!(record.copy_text.contains(&"Possible Fixes".to_string()));
        assert!(record.copy_text.contains(&"Context".to_string()));
    }

    #[test]
    fn test_render_terminal_diagnostic_output_uses_copy_text() {
        let payload = serialize_payload(diagnostic_record_from_input(
            "logger-test",
            LogLevel::Warn,
            LoggerDiagnosticInput {
                code: "TEST_WARN".to_string(),
                title: "Pretty output".to_string(),
                root_cause: vec![
                    "The warning must stay JSON parseable.".to_string(),
                    "Each array entry should render on its own line.".to_string(),
                ],
                exact_fix: Some(vec!["Use pretty JSON for diagnostic arrays.".to_string()]),
                possible_fixes: None,
                details: None,
            },
        ));
        let rendered = render_output(
            OutputFormat::Terminal,
            "00:00:00.000",
            LogLevel::Warn,
            "logger-test",
            &payload,
            true,
        );

        assert!(rendered.starts_with("00:00:00.000 WARN  logger-test [TEST_WARN] Pretty output"));
        assert!(rendered.contains("\n  Root Cause\n"));
        assert!(rendered.contains("  - The warning must stay JSON parseable."));
        assert!(!rendered.contains("\"copyText\""));
    }

    #[test]
    fn test_render_structured_output_is_plain_json() {
        let payload = Value::Object(Map::from_iter([(
            "message".to_string(),
            Value::String("hello".to_string()),
        )]));

        let rendered = render_output(
            OutputFormat::StructuredJson,
            "00:00:00.000",
            LogLevel::Info,
            "logger-test",
            &payload,
            false,
        );

        assert!(!rendered.contains('\u{1b}'));

        let parsed: Value = match serde_json::from_str(&rendered) {
            Ok(value) => value,
            Err(error) => panic!("failed to parse rendered json: {error}\n{rendered}"),
        };
        assert_eq!(parsed["$"][1], "INFO");
        assert_eq!(parsed["_"]["message"], "hello");
    }

    #[test]
    fn test_render_terminal_message_output_is_human_readable() {
        let payload = serde_json::json!({
            "started": {
                "command": "execute",
            }
        });

        let rendered = render_output(
            OutputFormat::Terminal,
            "00:00:00.000",
            LogLevel::Info,
            "PluginPipeline",
            &payload,
            false,
        );

        assert_eq!(
            rendered,
            r#"00:00:00.000 INFO  PluginPipeline started {"command":"execute"}"#
        );
    }

    #[test]
    fn test_silent_logger_buffers_diagnostics() {
        clear_buffered_diagnostics();

        let logger = create_logger("buffer-test", Some(LogLevel::Silent));
        assert!(
            logger
                .warn(LoggerDiagnosticInput {
                    code: "BUFFERED_WARN".to_string(),
                    title: "Buffered diagnostic".to_string(),
                    root_cause: vec!["Silent mode should still retain diagnostics.".to_string()],
                    exact_fix: None,
                    possible_fixes: None,
                    details: None,
                })
                .is_none()
        );

        let drained = drain_buffered_diagnostics();
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].code, "BUFFERED_WARN");
    }
}
