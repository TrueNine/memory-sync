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
                "distStatus": {"type": "array", "items": {"type": "string", "enum": status_enum}}
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
            "required": ["promptId"]
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

fn handle_list_prompts(args: &Value) -> Value {
  let base = build_service_options(args);
  let kinds: Option<Vec<tnmsd::ManagedPromptKind>> = args
    .get("kinds")
    .and_then(|v| serde_json::from_value(v.clone()).ok());
  let query = args.get("query").and_then(|v| v.as_str()).map(String::from);
  let en_status: Option<Vec<tnmsd::PromptArtifactState>> = args
    .get("enStatus")
    .and_then(|v| serde_json::from_value(v.clone()).ok());

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
        eprintln!("JSON parse error: {}", e);
        continue;
      }
    };

    let is_notification = !request.as_object().map_or(false, |m| m.contains_key("id"));
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
      "tools/call" => {
        let params = request.get("params").cloned().unwrap_or(json!({}));
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": handle_tools_call(&params)
        })
      }
      _ => json!({
          "jsonrpc": "2.0",
          "id": id,
          "error": {
              "code": -32601,
              "message": format!("Method not found: {}", method)
          }
      }),
    };

    let _ = writeln!(writer, "{}", response);
    let _ = writer.flush();
  }
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
  let logger = tnmsd::infra::logger::create_logger("tnmsm", None);

  match resolve_command(&cli) {
    ResolvedCommand::Serve => {
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
      let _span = logger.span("command.assemble_npm").enter();
      commands::package::execute(&args)
    }
  }
}
