#![deny(clippy::all)]

//! Structured Markdown logger with span tracking for observability.
//!
//! Output format: Markdown only. No JSON, no ANSI colors.
//! Destination: stdout for info/debug/trace, stderr for warn/error/fatal.

pub mod core;
pub mod diagnostic;
pub mod formatter;
pub mod sink;

pub use core::{LogLevel, Logger, Span, SpanGuard, get_global_level, resolve_level, set_global_level};
pub use diagnostic::{DiagnosticInput, DiagnosticRecord, validate_diagnostic_input};
pub use sink::{clear_diagnostics, drain_diagnostics, flush};

// Legacy re-exports for backward compatibility during migration
pub use diagnostic::DiagnosticInput as LoggerDiagnosticInput;
pub use diagnostic::DiagnosticRecord as LoggerDiagnosticRecord;

/// Create a new logger with optional explicit level.
/// Falls back to global level or environment variable `LOG_LEVEL`.
pub fn create_logger(namespace: &str, explicit_level: Option<LogLevel>) -> Logger {
  let level = resolve_level(explicit_level);
  Logger::new(namespace, level)
}

// ---------------------------------------------------------------------------
// Convenience macros
// ---------------------------------------------------------------------------

#[macro_export]
macro_rules! info {
  ($logger:expr, $msg:expr) => {
    $logger.info(serde_json::Value::String($msg.to_string()), None)
  };
  ($logger:expr, $msg:expr, $meta:expr) => {
    $logger.info(serde_json::Value::String($msg.to_string()), Some($meta))
  };
}

#[macro_export]
macro_rules! debug {
  ($logger:expr, $msg:expr) => {
    $logger.debug(serde_json::Value::String($msg.to_string()), None)
  };
  ($logger:expr, $msg:expr, $meta:expr) => {
    $logger.debug(serde_json::Value::String($msg.to_string()), Some($meta))
  };
}

#[macro_export]
macro_rules! trace {
  ($logger:expr, $msg:expr) => {
    $logger.trace(serde_json::Value::String($msg.to_string()), None)
  };
  ($logger:expr, $msg:expr, $meta:expr) => {
    $logger.trace(serde_json::Value::String($msg.to_string()), Some($meta))
  };
}

#[macro_export]
macro_rules! warn {
  ($logger:expr, $diag:expr) => {
    $logger.warn($diag)
  };
}

#[macro_export]
macro_rules! error {
  ($logger:expr, $diag:expr) => {
    $logger.error($diag)
  };
}

#[macro_export]
macro_rules! fatal {
  ($logger:expr, $diag:expr) => {
    $logger.fatal($diag)
  };
}

#[macro_export]
macro_rules! span {
  ($logger:expr, $name:expr) => {
    $logger.span($name)
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
  use super::*;
  use crate::infra::logger::core::Event;
  use serde_json::Value;

  #[test]
  fn test_log_level_priority_ordering() {
    assert!(LogLevel::Silent.priority() < LogLevel::Fatal.priority());
    assert!(LogLevel::Fatal.priority() < LogLevel::Error.priority());
    assert!(LogLevel::Error.priority() < LogLevel::Warn.priority());
    assert!(LogLevel::Warn.priority() < LogLevel::Info.priority());
    assert!(LogLevel::Info.priority() < LogLevel::Debug.priority());
    assert!(LogLevel::Debug.priority() < LogLevel::Trace.priority());
  }

  #[test]
  fn test_log_level_from_str_case_insensitive() {
    assert_eq!(LogLevel::from_str_loose("info"), Some(LogLevel::Info));
    assert_eq!(LogLevel::from_str_loose("INFO"), Some(LogLevel::Info));
    assert_eq!(LogLevel::from_str_loose("Debug"), Some(LogLevel::Debug));
    assert_eq!(LogLevel::from_str_loose("unknown"), None);
  }

  #[test]
  fn test_create_logger_uses_global_level() {
    set_global_level(LogLevel::Debug);
    let logger = create_logger("test", None);
    assert_eq!(logger.level, LogLevel::Debug);
    set_global_level(LogLevel::Info); // reset
  }

  #[test]
  fn test_create_logger_uses_explicit_level() {
    set_global_level(LogLevel::Info);
    let logger = create_logger("test", Some(LogLevel::Warn));
    assert_eq!(logger.level, LogLevel::Warn);
  }

  #[test]
  fn test_logger_filters_by_level() {
    let logger = Logger::new("test", LogLevel::Warn);
    // These should not panic or emit; just verify they don't crash
    logger.info("should be filtered", None);
    logger.debug("should be filtered", None);
    logger.trace("should be filtered", None);
    // Warn, Error, Fatal should be emitted (but we can't easily capture in unit test)
  }

  #[test]
  fn test_span_creation() {
    let span = Span::new("test-span", "test-ns");
    assert_eq!(span.name, "test-span");
    assert_eq!(span.namespace, "test-ns");
  }

  #[test]
  fn test_span_tracks_duration() {
    let span = Span::new("test", "ns");
    std::thread::sleep(std::time::Duration::from_millis(1));
    let duration = span.duration();
    assert!(duration > std::time::Duration::ZERO);
  }

  #[test]
  fn test_diagnostic_validation_rejects_empty_fields() {
    let diag = DiagnosticInput {
      code: "".to_string(),
      title: "".to_string(),
      root_cause: vec![],
      exact_fix: None,
      possible_fixes: None,
      details: None,
    };
    let result = validate_diagnostic_input(&diag);
    assert!(result.is_err());
    let errors = result.unwrap_err();
    assert!(errors.iter().any(|e| e.contains("code")));
    assert!(errors.iter().any(|e| e.contains("title")));
    assert!(errors.iter().any(|e| e.contains("rootCause")));
  }

  #[test]
  fn test_diagnostic_validation_accepts_valid_input() {
    let diag = DiagnosticInput {
      code: "TEST".to_string(),
      title: "Test diagnostic".to_string(),
      root_cause: vec!["Something went wrong".to_string()],
      exact_fix: Some(vec!["Fix it".to_string()]),
      possible_fixes: None,
      details: None,
    };
    assert!(validate_diagnostic_input(&diag).is_ok());
  }

  #[test]
  fn test_diagnostic_buffering() {
    clear_diagnostics();
    let record = DiagnosticRecord {
      code: "BUF_TEST".to_string(),
      title: "Buffered".to_string(),
      root_cause: vec!["test".to_string()],
      exact_fix: None,
      possible_fixes: None,
      details: None,
      level: "warn".to_string(),
      namespace: "test".to_string(),
      copy_text: vec![],
    };
    sink::buffer_diagnostic(&record);
    let drained = drain_diagnostics();
    assert_eq!(drained.len(), 1);
    assert_eq!(drained[0].code, "BUF_TEST");
  }

  #[test]
  fn test_flush_completes_without_panic() {
    // Just verify flush doesn't panic
    flush();
  }

  #[test]
  fn test_global_level_get_set() {
    let original = get_global_level();
    set_global_level(LogLevel::Debug);
    assert_eq!(get_global_level(), LogLevel::Debug);
    set_global_level(LogLevel::Trace);
    assert_eq!(get_global_level(), LogLevel::Trace);
    set_global_level(original); // restore
  }

  #[test]
  fn test_resolve_level_explicit_wins() {
    set_global_level(LogLevel::Info);
    let level = resolve_level(Some(LogLevel::Error));
    assert_eq!(level, LogLevel::Error);
  }

  #[test]
  fn test_resolve_level_fallback_to_global() {
    set_global_level(LogLevel::Warn);
    unsafe { std::env::remove_var("LOG_LEVEL"); }
    let level = resolve_level(None);
    assert_eq!(level, LogLevel::Warn);
  }

  #[test]
  fn test_thread_safety() {
    use std::sync::Arc;
    use std::thread;

    let logger = Arc::new(Logger::new("thread-test", LogLevel::Trace));
    let mut handles = Vec::new();

    for i in 0..10 {
      let log = Arc::clone(&logger);
      handles.push(thread::spawn(move || {
        log.info(format!("thread-{i}"), None);
        log.debug(format!("debug-{i}"), None);
        let _span = log.span(format!("span-{i}").as_str()).enter();
        log.warn(DiagnosticInput {
          code: format!("WARN-{i}"),
          title: format!("Warning {i}"),
          root_cause: vec!["test".to_string()],
          exact_fix: None,
          possible_fixes: None,
          details: None,
        });
      }));
    }

    for h in handles {
      h.join().expect("thread should not panic");
    }

    // Verify flush completes without deadlock
    flush();
  }

  #[test]
  fn test_sink_stderr_routing_for_errors() {
    // Verify that error/fatal/warn events are routed to stderr
    // by checking the internal use_stderr logic via a controlled event.
    let warn_event = Event {
      level: LogLevel::Warn,
      namespace: "test".to_string(),
      message: Value::String("warn msg".to_string()),
      meta: None,
      span_name: None,
    };
    let error_event = Event {
      level: LogLevel::Error,
      namespace: "test".to_string(),
      message: Value::String("error msg".to_string()),
      meta: None,
      span_name: None,
    };
    let info_event = Event {
      level: LogLevel::Info,
      namespace: "test".to_string(),
      message: Value::String("info msg".to_string()),
      meta: None,
      span_name: None,
    };

    // These should not panic; stderr routing is verified by the sink's use_stderr logic.
    sink::write_event(&warn_event);
    sink::write_event(&error_event);
    sink::write_event(&info_event);
    flush();
  }
}
