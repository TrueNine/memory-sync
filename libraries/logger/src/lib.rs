#![deny(clippy::all)]

//! Structured JSON logger with ANSI color support.
//!
//! Output format: `{"$":["HH:MM:SS.mmm","LEVEL","namespace"],"_":{...payload}}`
//!
//! This logger is designed to be consumed by both CLI (human-readable with colors)
//! and GUI (parsed as JSON after stripping ANSI codes).

use chrono::{Local, Timelike};
use std::sync::atomic::{AtomicU8, Ordering};

use serde::Serialize;
use serde_json::Value;

// ---------------------------------------------------------------------------
// ANSI colors
// ---------------------------------------------------------------------------

const RESET: &str = "\x1B[0m";
const RED: &str = "\x1B[31m";
const YELLOW: &str = "\x1B[33m";
const CYAN: &str = "\x1B[36m";
const MAGENTA: &str = "\x1B[35m";
const GRAY: &str = "\x1B[90m";
const BLUE: &str = "\x1B[34m";
const GREEN: &str = "\x1B[32m";
const WHITE: &str = "\x1B[37m";
const DIM: &str = "\x1B[2m";
const BG_RED: &str = "\x1B[41m";

fn colorize(color: &str, text: &str) -> String {
    format!("{color}{text}{RESET}")
}

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

    fn color_fn(self) -> fn(&str) -> String {
        match self {
            Self::Error => |s| colorize(RED, s),
            Self::Warn => |s| colorize(YELLOW, s),
            Self::Info => |s| colorize(CYAN, s),
            Self::Debug => |s| colorize(MAGENTA, s),
            Self::Trace => |s| colorize(GRAY, s),
            Self::Fatal => |s| colorize(BG_RED, s),
            Self::Silent => |s| colorize(WHITE, s),
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

// ---------------------------------------------------------------------------
// Global log level
// ---------------------------------------------------------------------------

static GLOBAL_LOG_LEVEL: AtomicU8 = AtomicU8::new(255); // 255 = unset

/// Set the global log level for all loggers.
pub fn set_global_log_level(level: LogLevel) {
    GLOBAL_LOG_LEVEL.store(level.priority(), Ordering::Relaxed);
}

/// Get the current global log level.
pub fn get_global_log_level() -> Option<LogLevel> {
    let v = GLOBAL_LOG_LEVEL.load(Ordering::Relaxed);
    if v == 255 { None } else { priority_to_level(v) }
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
// Colorized JSON formatting (matches TS toJson / colorizeValue)
// ---------------------------------------------------------------------------

fn colorize_value(val: &Value) -> String {
    match val {
        Value::Null => colorize(DIM, "null"),
        Value::Bool(b) => colorize(YELLOW, &b.to_string()),
        Value::Number(n) => colorize(BLUE, &n.to_string()),
        Value::String(s) => colorize(GREEN, &format!("\"{}\"", s)),
        Value::Array(arr) => {
            if arr.is_empty() {
                "[]".to_string()
            } else {
                let parts: Vec<String> = arr.iter().map(colorize_value).collect();
                format!("[{}]", parts.join(","))
            }
        }
        Value::Object(map) => {
            if map.is_empty() {
                "{}".to_string()
            } else {
                let parts: Vec<String> = map
                    .iter()
                    .map(|(k, v)| {
                        let key = colorize(MAGENTA, &format!("\"{}\"", k));
                        format!("{}:{}", key, colorize_value(v))
                    })
                    .collect();
                format!("{{{}}}", parts.join(","))
            }
        }
    }
}

fn to_colored_json(val: &Value) -> String {
    colorize_value(val)
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
// Format and print
// ---------------------------------------------------------------------------

fn format_log(
    level: LogLevel,
    namespace: &str,
    message: &Value,
    meta: Option<&Value>,
) -> LogRecord {
    let ts = timestamp();
    let color_fn = level.color_fn();

    let payload = build_payload(message, meta);

    let record = LogRecord {
        meta: (ts.clone(), level.as_str().to_string(), namespace.to_string()),
        payload: payload.clone(),
    };

    let colored_level = color_fn(&level.as_str().to_ascii_uppercase());
    let base_meta = Value::Array(vec![
        Value::String(ts),
        Value::String(colored_level),
        Value::String(namespace.to_string()),
    ]);

    let mut output_map = serde_json::Map::new();
    output_map.insert("$".to_string(), base_meta);
    output_map.insert("_".to_string(), payload);
    let output = to_colored_json(&Value::Object(output_map));

    match level {
        LogLevel::Error | LogLevel::Fatal => eprintln!("{}", output),
        LogLevel::Warn => eprintln!("{}", output),
        LogLevel::Debug | LogLevel::Trace => eprintln!("{}", output),
        _ => println!("{}", output),
    }

    record
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
    map.insert("message".to_string(), Value::String(message_str.to_string()));
    map.insert("meta".to_string(), meta_val.clone());
    Value::Object(map)
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

pub struct Logger {
    namespace: String,
    level: LogLevel,
}

impl Logger {
    pub fn error(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log(LogLevel::Error, message.into(), meta)
    }

    pub fn warn(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log(LogLevel::Warn, message.into(), meta)
    }

    pub fn info(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log(LogLevel::Info, message.into(), meta)
    }

    pub fn debug(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log(LogLevel::Debug, message.into(), meta)
    }

    pub fn trace(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log(LogLevel::Trace, message.into(), meta)
    }

    pub fn fatal(&self, message: impl Into<Value>, meta: Option<Value>) -> Option<LogRecord> {
        self.log(LogLevel::Fatal, message.into(), meta)
    }

    fn log(&self, level: LogLevel, message: Value, meta: Option<Value>) -> Option<LogRecord> {
        if level.priority() > self.level.priority() {
            return None;
        }
        Some(format_log(level, &self.namespace, &message, meta.as_ref()))
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
    ($logger:expr, $msg:expr) => {
        $logger.error(serde_json::Value::String($msg.to_string()), None)
    };
    ($logger:expr, $msg:expr, $meta:expr) => {
        $logger.error(serde_json::Value::String($msg.to_string()), Some($meta))
    };
}

#[macro_export]
macro_rules! log_warn {
    ($logger:expr, $msg:expr) => {
        $logger.warn(serde_json::Value::String($msg.to_string()), None)
    };
    ($logger:expr, $msg:expr, $meta:expr) => {
        $logger.warn(serde_json::Value::String($msg.to_string()), Some($meta))
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
        LogLevel, Logger, create_logger as core_create_logger, get_global_log_level as core_get_global,
        set_global_log_level as core_set_global,
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
            self.inner.log(level, Value::String(message), meta);
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
    fn test_colorize_value() {
        let val = Value::String("hello".to_string());
        let colored = colorize_value(&val);
        assert!(colored.contains("hello"));
        assert!(colored.contains(GREEN));
    }

    #[test]
    fn test_create_logger_default_level() {
        let logger = create_logger("test", None);
        assert_eq!(logger.level, LogLevel::Info);
    }

    #[test]
    fn test_logger_filters_by_level() {
        let logger = create_logger("test", Some(LogLevel::Warn));
        assert!(logger.log(LogLevel::Info, Value::String("hi".into()), None).is_none());
        assert!(logger.log(LogLevel::Error, Value::String("err".into()), None).is_some());
    }

    #[test]
    fn test_build_payload_uses_meta_when_message_is_empty() {
        let payload = build_payload(&Value::String(String::new()), Some(&serde_json::json!([1, 2, 3])));
        assert_eq!(payload, serde_json::json!([1, 2, 3]));
    }

    #[test]
    fn test_build_payload_wraps_non_object_meta_for_named_message() {
        let payload = build_payload(&Value::String("hello".into()), Some(&serde_json::json!(["x"])));
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
}
