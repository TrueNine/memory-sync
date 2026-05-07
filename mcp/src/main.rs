mod cli;
mod commands;

use std::io::{BufRead, Write};
use std::process::ExitCode;

use clap::Parser;
use serde_json::{Value, json};
use tnmsd::{
  ListPromptsOptions, PromptServiceOptions, UpsertPromptSourceInput, WritePromptArtifactsInput,
  get_prompt, list_prompts, upsert_prompt_source, write_prompt_artifacts,
};

use cli::{Cli, ResolvedCommand, resolve_command};

const SERVER_NAME: &str = "@truenine/memory-sync-mcp";
const PROTOCOL_VERSION: &str = "2024-11-05";

fn build_service_options(args: &Value) -> PromptServiceOptions {
  let workspace_dir = args.get("workspaceDir").and_then(|v| v.as_str());
  match workspace_dir {
    Some(dir) => PromptServiceOptions {
      cwd: Some(dir.to_string()),
      plugin_options: Some(json!({"workspaceDir": dir})),
      ..Default::default()
    },
    None => PromptServiceOptions::default(),
  }
}

fn success_result(value: Value) -> Value {
  json!({
      "content": [{
          "type": "text",
          "text": serde_json::to_string_pretty(&value).unwrap_or_default()
      }]
  })
}

fn error_result(message: &str) -> Value {
  json!({
      "content": [{
          "type": "text",
          "text": message
      }],
      "isError": true
  })
}

fn json_rpc_error_response(id: Value, code: i64, message: &str) -> Value {
  json!({
      "jsonrpc": "2.0",
      "id": id,
      "error": {
          "code": code,
          "message": message
      }
  })
}

fn handle_initialize() -> Value {
  json!({
      "capabilities": {
          "tools": {}
      },
      "protocolVersion": PROTOCOL_VERSION,
      "serverInfo": {
          "name": SERVER_NAME,
          "version": env!("CARGO_PKG_VERSION")
      }
  })
}

fn tool_definitions() -> Vec<Value> {
  let prompt_kind_enum = json!([
    "global-memory",
    "workspace-memory",
    "project-memory",
    "project-child-memory",
    "skill",
    "skill-child-doc",
    "command",
    "subagent",
    "rule"
  ]);
  let status_enum = json!(["missing", "stale", "ready"]);

  vec![
    json!({
        "name": "list_prompts",
        "title": "List Prompts",
        "description": "List managed prompt records with zh/en/dist status signals.",
        "inputSchema": {
            "type": "object",
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "properties": {
                "workspaceDir": {"type": "string"},
                "kinds": {"type": "array", "items": {"type": "string", "enum": prompt_kind_enum}},
                "query": {"type": "string"},
                "enStatus": {"type": "array", "items": {"type": "string", "enum": status_enum}},
                // Fixes #227: distStatus removed — handler does not implement it
            }
        }
    }),
    json!({
        "name": "get_prompt",
        "title": "Get Prompt",
        "description": "Read a single managed prompt and return its source and dist artifacts.",
        "inputSchema": {
            "type": "object",
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "properties": {
                "workspaceDir": {"type": "string"},
                "promptId": {"type": "string"}
            },
            // Fixes #228: enContent is required by handler
            "required": ["promptId", "enContent"]
        }
    }),
    json!({
        "name": "upsert_prompt_src",
        "title": "Upsert Prompt Source",
        "description": "Create or update zh/en source prompt files without touching dist.",
        "inputSchema": {
            "type": "object",
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "properties": {
                "workspaceDir": {"type": "string"},
                "promptId": {"type": "string"},
                "locale": {"type": "string", "enum": ["zh", "en"]},
                "content": {"type": "string"}
            },
            "required": ["promptId", "content"]
        }
    }),
    json!({
        "name": "apply_prompt_translation",
        "title": "Apply Prompt Translation",
        "description": "Write externally generated en source and optional dist prompt content.",
        "inputSchema": {
            "type": "object",
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "properties": {
                "workspaceDir": {"type": "string"},
                "promptId": {"type": "string"},
                "enContent": {"type": "string"},
                "distContent": {"type": "string"}
            },
            "required": ["promptId"]
        }
    }),
  ]
}

fn handle_tools_list() -> Value {
  json!({"tools": tool_definitions()})
}

fn handle_tools_call(params: &Value) -> Value {
  let name = match params.get("name").and_then(|v| v.as_str()) {
    Some(n) => n,
    None => return error_result("Missing tool name"),
  };
  let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

  let logger = tnmsd::infra::logger::create_logger("mcp.tools", None);
  let _span = logger.span(&format!("tools.{}", name)).enter();

  match name {
    "list_prompts" => handle_list_prompts(&arguments),
    "get_prompt" => handle_get_prompt(&arguments),
    "upsert_prompt_src" => handle_upsert_prompt_src(&arguments),
    "apply_prompt_translation" => handle_apply_prompt_translation(&arguments),
    _ => error_result(&format!("Unknown tool: {}", name)),
  }
}

fn parse_object_params(request: &Value, method: &str) -> Result<Value, String> {
  // Fixes #376: JSON-RPC object params must be validated before dispatch so
  // array params return the standard -32602 Invalid params error.
  match request.get("params") {
    None | Some(Value::Null) => Ok(json!({})),
    Some(Value::Object(_)) => Ok(request.get("params").cloned().unwrap_or(json!({}))),
    Some(_) => Err(format!("Invalid params for {method}: expected object")),
  }
}

fn build_tools_call_response(id: Value, request: &Value) -> Value {
  match parse_object_params(request, "tools/call") {
    Ok(params) => json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": handle_tools_call(&params)
    }),
    Err(message) => json_rpc_error_response(id, -32602, &message),
  }
}

fn handle_list_prompts(args: &Value) -> Value {
  let base = build_service_options(args);
  // Fixes #384: invalid enum filters must surface as MCP errors instead of
  // silently degrading to an unfiltered query.
  let kinds: Option<Vec<tnmsd::ManagedPromptKind>> = match parse_optional_kinds_arg(args, "kinds") {
    Ok(value) => value,
    Err(error) => return error_result(&error),
  };
  let query = args.get("query").and_then(|v| v.as_str()).map(String::from);
  let en_status: Option<Vec<tnmsd::PromptArtifactState>> =
    match parse_optional_prompt_state_arg(args, "enStatus") {
      Ok(value) => value,
      Err(error) => return error_result(&error),
    };

  let options = ListPromptsOptions {
    base,
    kinds,
    query,
    en_status,
  };

  match list_prompts(&options) {
    Ok(prompts) => success_result(json!({"prompts": prompts})),
    Err(e) => error_result(&e),
  }
}

fn parse_optional_kinds_arg(
  args: &Value,
  key: &str,
) -> Result<Option<Vec<tnmsd::ManagedPromptKind>>, String> {
  // Fixes #384: keep enum-filter validation explicit even after the caller
  // has delegated parsing into a helper.
  match args.get(key) {
    Some(value) if !value.is_null() => serde_json::from_value(value.clone())
      .map(Some)
      .map_err(|error| format!("Invalid '{key}': {error}")),
    _ => Ok(None),
  }
}

fn parse_optional_prompt_state_arg(
  args: &Value,
  key: &str,
) -> Result<Option<Vec<tnmsd::PromptArtifactState>>, String> {
  // Fixes #384: prompt artifact states should fail closed on invalid values.
  match args.get(key) {
    Some(value) if !value.is_null() => serde_json::from_value(value.clone())
      .map(Some)
      .map_err(|error| format!("Invalid '{key}': {error}")),
    _ => Ok(None),
  }
}

fn handle_get_prompt(args: &Value) -> Value {
  let options = build_service_options(args);
  let prompt_id = match args.get("promptId").and_then(|v| v.as_str()) {
    Some(id) => id.to_string(),
    None => return error_result("promptId is required"),
  };

  match get_prompt(&prompt_id, &options) {
    Ok(Some(prompt)) => success_result(json!({"prompt": prompt})),
    Ok(None) => success_result(json!({"prompt": Value::Null})),
    Err(e) => error_result(&e),
  }
}

fn handle_upsert_prompt_src(args: &Value) -> Value {
  let base = build_service_options(args);
  let prompt_id = match args.get("promptId").and_then(|v| v.as_str()) {
    Some(id) => id.to_string(),
    None => return error_result("promptId is required"),
  };
  let content = match args.get("content").and_then(|v| v.as_str()) {
    Some(c) => c.to_string(),
    None => return error_result("content is required"),
  };
  let locale: Option<tnmsd::PromptSourceLocale> = args
    .get("locale")
    .and_then(|v| serde_json::from_value(v.clone()).ok());

  let input = UpsertPromptSourceInput {
    base,
    prompt_id,
    locale,
    content,
  };

  match upsert_prompt_source(&input) {
    Ok(prompt) => success_result(json!({"prompt": prompt})),
    Err(e) => error_result(&e),
  }
}

fn handle_apply_prompt_translation(args: &Value) -> Value {
  let base = build_service_options(args);
  let prompt_id = match args.get("promptId").and_then(|v| v.as_str()) {
    Some(id) => id.to_string(),
    None => return error_result("promptId is required"),
  };
  let en_content = args
    .get("enContent")
    .and_then(|v| v.as_str())
    .map(String::from);

  if en_content.is_none() {
    return error_result("apply_prompt_translation requires enContent");
  }

  let input = WritePromptArtifactsInput {
    base,
    prompt_id,
    en_content,
  };

  match write_prompt_artifacts(&input) {
    Ok(prompt) => success_result(json!({"prompt": prompt})),
    Err(e) => error_result(&e),
  }
}

fn run_stdio_server() {
  let stdin = std::io::stdin();
  let stdout = std::io::stdout();
  let reader = stdin.lock();
  let mut writer = stdout.lock();

  for line in reader.lines() {
    let line = match line {
      Ok(l) => l,
      Err(_) => break,
    };

    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }

    let request: Value = match serde_json::from_str(trimmed) {
      Ok(v) => v,
      Err(e) => {
        tnmsd::infra::logger::sink::write_event(&tnmsd::infra::logger::core::Event {
          level: tnmsd::infra::logger::LogLevel::Error,
          namespace: "tnmsm".to_string(),
          message: serde_json::Value::String(format!("JSON parse error: {e}")),
          meta: None,
          span_name: None,
        });
        continue;
      }
    };

    let is_notification = !request.as_object().is_some_and(|m| m.contains_key("id"));
    if is_notification {
      continue;
    }

    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let method = request.get("method").and_then(|v| v.as_str()).unwrap_or("");

    let response = match method {
      "initialize" => json!({
          "jsonrpc": "2.0",
          "id": id,
          "result": handle_initialize()
      }),
      "tools/list" => json!({
          "jsonrpc": "2.0",
          "id": id,
          "result": handle_tools_list()
      }),
      "tools/call" => build_tools_call_response(id, &request),
      _ => json_rpc_error_response(id, -32601, &format!("Method not found: {}", method)),
    };

    // Fixes #383: once the client closes stdout, stop the loop instead of
    // continuing to process requests that can never be delivered.
    if write_json_response(&mut writer, &response).is_err() {
      break;
    }
  }
}

fn write_json_response(writer: &mut impl Write, response: &Value) -> std::io::Result<()> {
  // Fixes #383: funnel response writes through one fallible path so BrokenPipe
  // reaches the stdio loop and terminates the server cleanly.
  writeln!(writer, "{}", response)?;
  writer.flush()
}

fn main() -> ExitCode {
  // Initialize logger, default Info, override via LOG_LEVEL env var
  tnmsd::infra::logger::set_global_level(
    std::env::var("LOG_LEVEL")
      .ok()
      .and_then(|s| tnmsd::infra::logger::LogLevel::from_str_loose(&s))
      .unwrap_or(tnmsd::infra::logger::LogLevel::Info),
  );

  let cli = Cli::parse();

  match resolve_command(&cli) {
    ResolvedCommand::Serve => {
      let logger = tnmsd::infra::logger::create_logger("mcp.server", None);
      let _span = logger.span("server.serve").enter();
      logger.info(
        "MCP server started",
        Some(json!({
          "serverName": SERVER_NAME,
          "protocolVersion": PROTOCOL_VERSION,
        })),
      );
      run_stdio_server();
      ExitCode::SUCCESS
    }
    ResolvedCommand::AssembleNpm(args) => {
      // Fixes #225: keep hidden packaging output off stdout as well; the
      // package command writes human-readable status to stderr internally.
      commands::package::execute(&args)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  struct BrokenPipeWriter;

  impl Write for BrokenPipeWriter {
    fn write(&mut self, _buf: &[u8]) -> std::io::Result<usize> {
      Err(std::io::Error::from(std::io::ErrorKind::BrokenPipe))
    }

    fn flush(&mut self) -> std::io::Result<()> {
      Ok(())
    }
  }

  #[test]
  fn list_prompts_rejects_invalid_kinds_filter() {
    let result = handle_list_prompts(&json!({
      "kinds": ["projct-memory"]
    }));

    assert_eq!(result.get("isError").and_then(Value::as_bool), Some(true));
    assert!(
      result
        .get("content")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
        .is_some_and(|text| text.contains("kinds")),
      "invalid kinds filter should surface an MCP error"
    );
  }

  #[test]
  fn list_prompts_rejects_invalid_en_status_filter() {
    let result = handle_list_prompts(&json!({
      "enStatus": ["unkown"]
    }));

    assert_eq!(result.get("isError").and_then(Value::as_bool), Some(true));
    assert!(
      result
        .get("content")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
        .is_some_and(|text| text.contains("enStatus")),
      "invalid enStatus filter should surface an MCP error"
    );
  }

  #[test]
  fn write_json_response_propagates_broken_pipe_errors() {
    let mut writer = BrokenPipeWriter;
    let result = write_json_response(&mut writer, &json!({"ok": true}));

    assert!(
      result.is_err(),
      "broken pipe writes must be visible to the stdio server loop"
    );
  }

  #[test]
  fn tools_call_rejects_array_params_with_json_rpc_invalid_params() {
    let response = build_tools_call_response(
      json!(7),
      &json!({
        "jsonrpc": "2.0",
        "id": 7,
        "method": "tools/call",
        "params": []
      }),
    );

    assert_eq!(response["error"]["code"], json!(-32602));
    assert!(
      response["error"]["message"]
        .as_str()
        .is_some_and(|message| message.contains("expected object")),
      "unexpected invalid params error: {response}"
    );
  }
}
