use std::sync::OnceLock;

static LOGGER: OnceLock<Logger> = OnceLock::new();

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd)]
pub enum LogLevel {
  Trace,
  Debug,
  Info,
  Warn,
  Error,
}

struct Logger {
  level: LogLevel,
}

impl Logger {
  fn new(level: LogLevel) -> Self {
    Self { level }
  }

  fn log(&self, level: LogLevel, message: &str) {
    if level >= self.level {
      eprintln!("[{}] {}", level_to_string(level), message);
    }
  }
}

fn level_to_string(level: LogLevel) -> &'static str {
  match level {
    LogLevel::Trace => "TRACE",
    LogLevel::Debug => "DEBUG",
    LogLevel::Info => "INFO",
    LogLevel::Warn => "WARN",
    LogLevel::Error => "ERROR",
  }
}

pub fn set_global_log_level(level: LogLevel) {
  let _ = LOGGER.set(Logger::new(level));
}

pub fn flush_output() {}

pub fn trace(message: &str) {
  if let Some(logger) = LOGGER.get() {
    logger.log(LogLevel::Trace, message);
  }
}

pub fn debug(message: &str) {
  if let Some(logger) = LOGGER.get() {
    logger.log(LogLevel::Debug, message);
  }
}

pub fn info(message: &str) {
  if let Some(logger) = LOGGER.get() {
    logger.log(LogLevel::Info, message);
  }
}

pub fn warn(message: &str) {
  if let Some(logger) = LOGGER.get() {
    logger.log(LogLevel::Warn, message);
  }
}

pub fn error(message: &str) {
  if let Some(logger) = LOGGER.get() {
    logger.log(LogLevel::Error, message);
  }
}
