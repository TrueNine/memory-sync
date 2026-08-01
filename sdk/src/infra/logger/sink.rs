use std::io::{self, Write};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{LazyLock, Mutex};
use std::thread;

use super::core::{Event, LogLevel, Span};
use super::diagnostic::DiagnosticRecord;
use super::formatter;

// ---------------------------------------------------------------------------
// Output command types
// ---------------------------------------------------------------------------

enum OutputCommand {
  Write { use_stderr: bool, output: String },
  Flush { ack: Sender<()> },
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

static OUTPUT_SINK: LazyLock<Sender<OutputCommand>> = LazyLock::new(spawn_output_sink);
static DIAGNOSTIC_BUFFER: LazyLock<Mutex<Vec<DiagnosticRecord>>> =
  LazyLock::new(|| Mutex::new(Vec::new()));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn write_event(event: &Event) {
  let use_stderr = matches!(
    event.level,
    LogLevel::Error | LogLevel::Fatal | LogLevel::Warn
  );
  let output = formatter::format_event(event);
  send_output(use_stderr, output);
}

pub fn write_span_enter(span: &Span) {
  let output = formatter::format_span_enter(span);
  send_output(false, output);
}

pub fn write_span_exit(span: &Span) {
  let output = formatter::format_span_exit(span);
  send_output(false, output);
}

pub fn buffer_diagnostic(record: &DiagnosticRecord) {
  if let Ok(mut buf) = DIAGNOSTIC_BUFFER.lock() {
    buf.push(record.clone());
  }
}

pub fn drain_diagnostics() -> Vec<DiagnosticRecord> {
  match DIAGNOSTIC_BUFFER.lock() {
    Ok(mut buf) => std::mem::take(&mut *buf),
    Err(_) => Vec::new(),
  }
}

pub fn clear_diagnostics() {
  if let Ok(mut buf) = DIAGNOSTIC_BUFFER.lock() {
    buf.clear();
  }
}

/// Bound the worker-drain wait so a wedged worker (deadlocked, sigstop'd,
/// blocked on a slow stdout pipe) can't hang process shutdown indefinitely.
const _FLUSH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

// Fixes #187: bound the ack wait with _FLUSH_TIMEOUT so a wedged worker
// can't hang process shutdown indefinitely
pub fn flush() {
  let (ack_tx, ack_rx) = mpsc::channel();
  if OUTPUT_SINK
    .send(OutputCommand::Flush { ack: ack_tx })
    .is_ok()
  {
    // Fixes #187: use recv_timeout instead of recv to avoid infinite block
    let _ = ack_rx.recv_timeout(_FLUSH_TIMEOUT);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn send_output(use_stderr: bool, output: String) {
  if OUTPUT_SINK
    .send(OutputCommand::Write {
      use_stderr,
      output: output.clone(),
    })
    .is_err()
  {
    write_direct(use_stderr, &output);
  }
}

fn write_direct(use_stderr: bool, output: &str) {
  if use_stderr {
    let mut stderr = io::stderr().lock();
    let _ = writeln!(stderr, "{output}");
    let _ = stderr.flush();
  } else {
    let mut stdout = io::stdout().lock();
    let _ = writeln!(stdout, "{output}");
    let _ = stdout.flush();
  }
}

fn spawn_output_sink() -> Sender<OutputCommand> {
  let (tx, rx) = mpsc::channel();
  // Fixes #186: don't panic if thread spawn fails — fall back to direct I/O
  match thread::Builder::new()
    .name("tnmsd-logger".to_string())
    .spawn(move || output_worker(rx))
  {
    Ok(_) => {}
    Err(e) => {
      eprintln!("logger: failed to spawn output worker: {e}");
    }
  }
  tx
}

// Fixes #364: catch panics so a single bad format doesn't kill the logger thread
fn output_worker(receiver: Receiver<OutputCommand>) {
  let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
    output_worker_inner(receiver);
  }));
  if let Err(e) = result {
    // Attempt to extract a useful message from the panic payload
    let msg = if let Some(s) = e.downcast_ref::<String>() {
      s.clone()
    } else if let Some(s) = e.downcast_ref::<&str>() {
      s.to_string()
    } else {
      "unknown panic".to_string()
    };
    eprintln!("logger: output worker panicked: {msg}");
  }
}

fn output_worker_inner(receiver: Receiver<OutputCommand>) {
  let stdout = io::stdout();
  let stderr = io::stderr();
  let mut stdout_writer = io::BufWriter::new(stdout);
  let mut stderr_writer = io::BufWriter::new(stderr);

  while let Ok(command) = receiver.recv() {
    match command {
      OutputCommand::Write { use_stderr, output } => {
        if use_stderr {
          let _ = writeln!(stderr_writer, "{output}");
        } else {
          let _ = writeln!(stdout_writer, "{output}");
        }
      }
      OutputCommand::Flush { ack } => {
        let _ = stdout_writer.flush();
        let _ = stderr_writer.flush();
        let _ = ack.send(());
      }
    }
  }

  let _ = stdout_writer.flush();
  let _ = stderr_writer.flush();
}
