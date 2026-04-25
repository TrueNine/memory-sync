use std::sync::atomic::{AtomicU8, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use super::diagnostic::{DiagnosticInput, invalid_record, record_from_input, validate_diagnostic_input};
use super::sink::buffer_diagnostic;

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
  pub fn priority(self) -> u8 {
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

  pub fn as_str(self) -> &'static str {
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
// Span
// ---------------------------------------------------------------------------

/// An operation span that tracks timing and nesting.
#[derive(Debug, Clone)]
pub struct Span {
  pub name: String,
  pub namespace: String,
  pub start: Instant,
}

impl Span {
  pub fn new(name: &str, namespace: &str) -> Self {
    Self {
      name: name.to_string(),
      namespace: namespace.to_string(),
      start: Instant::now(),
    }
  }

  pub fn enter(&self) -> SpanGuard {
    SpanGuard::new(self.clone())
  }

  pub fn duration(&self) -> Duration {
    self.start.elapsed()
  }
}

/// RAII guard that emits span exit event on drop.
pub struct SpanGuard {
  span: Span,
  exited: bool,
}

impl SpanGuard {
  fn new(span: Span) -> Self {
    // Emit span enter event immediately
    crate::infra::logger::sink::write_span_enter(&span);
    Self { span, exited: false }
  }

  pub fn exit(mut self) {
    self.do_exit();
  }

  fn do_exit(&mut self) {
    if self.exited {
      return;
    }
    self.exited = true;
    crate::infra::logger::sink::write_span_exit(&self.span);
  }
}

impl Drop for SpanGuard {
  fn drop(&mut self) {
    self.do_exit();
  }
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct Event {
  pub level: LogLevel,
  pub namespace: String,
  pub message: Value,
  pub meta: Option<Value>,
  pub span_name: Option<String>,
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/// A namespaced logger with configurable level.
pub struct Logger {
  pub namespace: String,
  pub level: LogLevel,
}

impl Logger {
  pub fn new(namespace: &str, level: LogLevel) -> Self {
    Self {
      namespace: namespace.to_string(),
      level,
    }
  }

  pub fn info(&self, message: impl Into<Value>, meta: Option<Value>) {
    self.log_message(LogLevel::Info, message.into(), meta);
  }

  pub fn debug(&self, message: impl Into<Value>, meta: Option<Value>) {
    self.log_message(LogLevel::Debug, message.into(), meta);
  }

  pub fn trace(&self, message: impl Into<Value>, meta: Option<Value>) {
    self.log_message(LogLevel::Trace, message.into(), meta);
  }

  pub fn warn(&self, diagnostic: DiagnosticInput) {
    self.log_diagnostic(LogLevel::Warn, diagnostic);
  }

  pub fn error(&self, diagnostic: DiagnosticInput) {
    self.log_diagnostic(LogLevel::Error, diagnostic);
  }

  pub fn fatal(&self, diagnostic: DiagnosticInput) {
    self.log_diagnostic(LogLevel::Fatal, diagnostic);
  }

  pub fn span(&self, name: &str) -> Span {
    Span::new(name, &self.namespace)
  }

  fn should_emit(&self, level: LogLevel) -> bool {
    level.priority() <= self.level.priority()
  }

  fn log_message(&self, level: LogLevel, message: Value, meta: Option<Value>) {
    if !self.should_emit(level) {
      return;
    }
    let event = Event {
      level,
      namespace: self.namespace.clone(),
      message,
      meta,
      span_name: None,
    };
    crate::infra::logger::sink::write_event(&event);
  }

  fn log_diagnostic(&self, level: LogLevel, diagnostic: DiagnosticInput) {
    let record = match validate_diagnostic_input(&diagnostic) {
      Ok(()) => record_from_input(&self.namespace, level.as_str(), diagnostic),
      Err(errors) => {
        invalid_record(&self.namespace, level.as_str(), serde_json::to_value(&diagnostic).unwrap_or_default(), &errors)
      }
    };

    // Buffer diagnostics even if level is Silent
    buffer_diagnostic(&record);

    if !self.should_emit(level) {
      return;
    }

    let event = Event {
      level,
      namespace: self.namespace.clone(),
      message: serde_json::to_value(&record).unwrap_or_default(),
      meta: None,
      span_name: None,
    };
    crate::infra::logger::sink::write_event(&event);
  }
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

static GLOBAL_LEVEL: AtomicU8 = AtomicU8::new(4); // Info default

pub fn set_global_level(level: LogLevel) {
  GLOBAL_LEVEL.store(level.priority(), Ordering::Relaxed);
}

pub fn get_global_level() -> LogLevel {
  match GLOBAL_LEVEL.load(Ordering::Relaxed) {
    0 => LogLevel::Silent,
    1 => LogLevel::Fatal,
    2 => LogLevel::Error,
    3 => LogLevel::Warn,
    4 => LogLevel::Info,
    5 => LogLevel::Debug,
    6 => LogLevel::Trace,
    _ => LogLevel::Info,
  }
}

pub fn resolve_level(explicit: Option<LogLevel>) -> LogLevel {
  if let Some(l) = explicit {
    return l;
  }
  if let Ok(env_val) = std::env::var("LOG_LEVEL")
    && let Some(l) = LogLevel::from_str_loose(&env_val)
  {
    return l;
  }
  get_global_level()
}
