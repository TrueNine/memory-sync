//! Embedded Deno-based runtime for executing TypeScript helper scripts.
//!
//! This implementation uses official Deno Rust crates (`deno_core` and
//! `deno_ast`) instead of shelling out to the external `deno` CLI.

use std::borrow::Cow;
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::rc::Rc;

use deno_ast::MediaType;
use deno_ast::ParseParams;
use deno_ast::SourceMapOption;
use deno_core::JsRuntime;
use deno_core::ModuleLoadOptions;
use deno_core::ModuleLoadReferrer;
use deno_core::ModuleLoadResponse;
use deno_core::ModuleLoader;
use deno_core::ModuleSource;
use deno_core::ModuleSourceCode;
use deno_core::ModuleSpecifier;
use deno_core::ModuleType;
use deno_core::ResolutionKind;
use deno_core::RuntimeOptions;
use deno_core::error::ModuleLoaderError;
use deno_core::resolve_import;
use deno_core::resolve_path;

type SourceMapStore = Rc<RefCell<HashMap<String, Vec<u8>>>>;

#[derive(Debug, serde::Deserialize)]
struct CapturedOutput {
  stdout: String,
  stderr: String,
}

pub struct DenoRuntime;

impl DenoRuntime {
  pub fn new() -> Result<Self, String> {
    Ok(Self)
  }

  /// Execute a TypeScript file and return its stdout as UTF-8 text.
  pub fn execute_ts(&self, script_path: &Path, context_json: &str) -> Result<String, String> {
    if !script_path.exists() {
      return Err(format!("Script not found: {}", script_path.display()));
    }

    tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .map_err(|error| format!("Failed to create embedded Deno runtime: {error}"))?
      .block_on(Self::execute_ts_async(script_path, context_json))
  }

  async fn execute_ts_async(script_path: &Path, context_json: &str) -> Result<String, String> {
    let source_map_store = Rc::new(RefCell::new(HashMap::new()));
    let module_loader = Rc::new(TypescriptModuleLoader {
      source_maps: source_map_store,
    });

    let mut js_runtime = JsRuntime::new(RuntimeOptions {
      module_loader: Some(module_loader),
      ..Default::default()
    });

    let current_dir = std::env::current_dir()
      .map_err(|error| format!("Unable to resolve current directory: {error}"))?;
    let main_module = resolve_path(&script_path.to_string_lossy(), &current_dir)
      .map_err(|error| format!("Unable to resolve script module: {error}"))?;

    let parsed_context: serde_json::Value = serde_json::from_str(context_json)
      .map_err(|error| format!("Invalid runtime context JSON: {error}"))?;
    let env_map = allowed_environment(&parsed_context);
    let bootstrap = format!(
      r#"
const __TNMS_CONTEXT_JSON = {context_json};
const __TNMS_ENV = {env_json};
globalThis.__tnmsContext = __TNMS_CONTEXT_JSON;
globalThis.__tnms_stdout = [];
globalThis.__tnms_stderr = [];
const __tnmsStringify = (value) => {{
  if (typeof value === "string") return value;
  try {{
    return JSON.stringify(value);
  }} catch (_error) {{
    return String(value);
  }}
}};
globalThis.console = {{
  log: (...args) => globalThis.__tnms_stdout.push(args.map(__tnmsStringify).join(" ")),
  error: (...args) => globalThis.__tnms_stderr.push(args.map(__tnmsStringify).join(" ")),
}};
globalThis.Deno = {{
  args: [],
  env: {{
    get: (name) => __TNMS_ENV[name],
    has: (name) => Object.prototype.hasOwnProperty.call(__TNMS_ENV, name),
    toObject: () => ({{ ...__TNMS_ENV }}),
  }},
}};
"#,
      context_json = parsed_context,
      env_json = serde_json::to_string(&env_map)
        .map_err(|error| format!("Failed to encode environment map: {error}"))?,
    );

    js_runtime
      .execute_script("<tnms-bootstrap>", bootstrap)
      .map_err(|error| format!("Failed to bootstrap embedded runtime: {error}"))?;

    let module_id = js_runtime
      .load_main_es_module(&main_module)
      .await
      .map_err(|error| format!("Failed to load TypeScript module: {error}"))?;
    let module_result = js_runtime.mod_evaluate(module_id);
    js_runtime
      .run_event_loop(Default::default())
      .await
      .map_err(|error| format!("Embedded Deno event loop failed: {error}"))?;
    module_result
      .await
      .map_err(|error| format!("Script execution failed: {error}"))?;

    let output_value = js_runtime
      .execute_script(
        "<tnms-capture>",
        String::from(
          r#"JSON.stringify({
          stdout: globalThis.__tnms_stdout.join("\n"),
          stderr: globalThis.__tnms_stderr.join("\n")
        })"#,
        ),
      )
      .map_err(|error| format!("Failed to read embedded script output: {error}"))?;

    let output_json = {
      deno_core::scope!(scope, &mut js_runtime);
      let local = deno_core::v8::Local::new(scope, output_value);
      deno_core::serde_v8::from_v8::<String>(scope, local)
        .map_err(|error| format!("Failed to decode embedded script output: {error}"))?
    };

    let captured: CapturedOutput = serde_json::from_str(&output_json)
      .map_err(|error| format!("Failed to parse embedded script output: {error}"))?;

    if !captured.stderr.trim().is_empty() {
      return Err(format!(
        "Script execution failed: {}",
        captured.stderr.trim()
      ));
    }

    Ok(captured.stdout)
  }

  /// Check if the embedded Deno runtime is available.
  pub fn is_available(&self) -> bool {
    true
  }

  /// Execute an arbitrary `proxy.ts` file with the shared proxy context shape.
  pub fn execute_proxy(
    &self,
    proxy_path: &Path,
    logical_path: &str,
    extra_context: serde_json::Value,
  ) -> Result<String, String> {
    let mut context = match extra_context {
      serde_json::Value::Object(map) => map,
      _ => {
        return Err("Proxy context must be a JSON object".to_string());
      }
    };
    context.insert(
      "logicalPath".to_string(),
      serde_json::Value::String(logical_path.to_string()),
    );

    self.execute_ts(proxy_path, &serde_json::Value::Object(context).to_string())
  }

  /// Resolve a public path using aindex/public/proxy.ts.
  pub fn resolve_public_path(
    &self,
    aindex_dir: &Path,
    logical_path: &str,
  ) -> Result<String, String> {
    let proxy_path = aindex_dir.join("public").join("proxy.ts");

    if !proxy_path.exists() {
      return Err(format!("proxy.ts not found at {}", proxy_path.display()));
    }

    let result = self.execute_proxy(&proxy_path, logical_path, serde_json::json!({}))?;

    Ok(result.trim().to_string())
  }

  /// Load project configuration from aindex/project/*/project.config.ts.
  pub fn load_project_config(
    &self,
    aindex_dir: &Path,
    project_name: &str,
    series_name: &str,
    workspace_dir: &Path,
  ) -> Result<serde_json::Value, String> {
    let config_path = aindex_dir
      .join(series_name)
      .join(project_name)
      .join("project.config.ts");

    if !config_path.exists() {
      return Err(format!(
        "project.config.ts not found at {}",
        config_path.display()
      ));
    }

    let context = serde_json::json!({
      "workspaceDir": workspace_dir.to_string_lossy(),
      "aindexDir": aindex_dir.to_string_lossy(),
      "projectName": project_name,
      "seriesName": series_name
    });

    let result = self.execute_ts(&config_path, &context.to_string())?;

    serde_json::from_str(&result)
      .map_err(|error| format!("Failed to parse project config JSON: {error}"))
  }
}

impl Default for DenoRuntime {
  fn default() -> Self {
    Self
  }
}

fn allowed_environment(context: &serde_json::Value) -> BTreeMap<String, String> {
  let allowlist = context
    .get("allowedEnv")
    .or_else(|| context.get("allowedEnvVars"))
    .and_then(serde_json::Value::as_array);

  allowlist
    .into_iter()
    .flatten()
    .filter_map(serde_json::Value::as_str)
    .filter_map(|name| {
      std::env::var(name)
        .ok()
        .map(|value| (name.to_string(), value))
    })
    .collect()
}

struct TypescriptModuleLoader {
  source_maps: SourceMapStore,
}

impl ModuleLoader for TypescriptModuleLoader {
  fn resolve(
    &self,
    specifier: &str,
    referrer: &str,
    _kind: ResolutionKind,
  ) -> Result<ModuleSpecifier, ModuleLoaderError> {
    resolve_import(specifier, referrer).map_err(deno_error::JsErrorBox::from_err)
  }

  fn load(
    &self,
    module_specifier: &ModuleSpecifier,
    _maybe_referrer: Option<&ModuleLoadReferrer>,
    _options: ModuleLoadOptions,
  ) -> ModuleLoadResponse {
    ModuleLoadResponse::Sync(self.load_module(module_specifier))
  }

  fn get_source_map(&self, specifier: &str) -> Option<Cow<'_, [u8]>> {
    self
      .source_maps
      .borrow()
      .get(specifier)
      .cloned()
      .map(Cow::Owned)
  }
}

impl TypescriptModuleLoader {
  fn load_module(
    &self,
    module_specifier: &ModuleSpecifier,
  ) -> Result<ModuleSource, ModuleLoaderError> {
    let path = module_specifier
      .to_file_path()
      .map_err(|_| deno_error::JsErrorBox::generic("Only file:// URLs are supported."))?;

    let media_type = MediaType::from_path(&path);
    let (module_type, should_transpile) = match media_type {
      MediaType::JavaScript | MediaType::Mjs | MediaType::Cjs => (ModuleType::JavaScript, false),
      MediaType::Jsx => (ModuleType::JavaScript, true),
      MediaType::TypeScript
      | MediaType::Mts
      | MediaType::Cts
      | MediaType::Dts
      | MediaType::Dmts
      | MediaType::Dcts
      | MediaType::Tsx => (ModuleType::JavaScript, true),
      MediaType::Json => (ModuleType::Json, false),
      _ => {
        return Err(deno_error::JsErrorBox::generic(format!(
          "Unknown extension {:?}",
          path.extension()
        )));
      }
    };

    let code = std::fs::read_to_string(&path).map_err(deno_error::JsErrorBox::from_err)?;
    let code = if should_transpile {
      let parsed = deno_ast::parse_module(ParseParams {
        specifier: module_specifier.clone(),
        text: code.into(),
        media_type,
        capture_tokens: false,
        scope_analysis: false,
        maybe_syntax: None,
      })
      .map_err(deno_error::JsErrorBox::from_err)?;
      let transpiled = parsed
        .transpile(
          &deno_ast::TranspileOptions {
            imports_not_used_as_values: deno_ast::ImportsNotUsedAsValues::Remove,
            decorators: deno_ast::DecoratorsTranspileOption::Ecma,
            ..Default::default()
          },
          &deno_ast::TranspileModuleOptions { module_kind: None },
          &deno_ast::EmitOptions {
            source_map: SourceMapOption::Separate,
            inline_sources: true,
            ..Default::default()
          },
        )
        .map_err(deno_error::JsErrorBox::from_err)?
        .into_source();

      if let Some(source_map) = transpiled.source_map {
        self
          .source_maps
          .borrow_mut()
          .insert(module_specifier.to_string(), String::into_bytes(source_map));
      }

      transpiled.text
    } else {
      code
    };

    Ok(ModuleSource::new(
      module_type,
      ModuleSourceCode::String(code.into()),
      module_specifier,
      None,
    ))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::{LazyLock, Mutex};
  use tempfile::TempDir;

  static ENV_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

  fn with_path_removed<T>(f: impl FnOnce() -> T) -> T {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let original = std::env::var_os("PATH");
    unsafe {
      std::env::remove_var("PATH");
    }
    let result = f();
    unsafe {
      match original {
        Some(path) => std::env::set_var("PATH", path),
        None => std::env::remove_var("PATH"),
      }
    }
    result
  }

  fn with_env_var<T>(name: &str, value: &str, f: impl FnOnce() -> T) -> T {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let original = std::env::var_os(name);
    unsafe {
      std::env::set_var(name, value);
    }
    let result = f();
    unsafe {
      match original {
        Some(value) => std::env::set_var(name, value),
        None => std::env::remove_var(name),
      }
    }
    result
  }

  #[test]
  fn test_deno_runtime_creation() {
    let runtime = DenoRuntime::new();
    assert!(runtime.is_ok());
  }

  #[test]
  fn test_execute_ts_without_path_still_works() {
    let tmp = TempDir::new().unwrap();
    let script_path = tmp.path().join("echo.ts");
    std::fs::write(&script_path, "console.log('embedded-deno-ok');").unwrap();

    let result = with_path_removed(|| {
      let runtime = DenoRuntime::new().unwrap();
      runtime.execute_ts(&script_path, "{}")
    });

    assert!(result.is_ok(), "expected embedded runtime, got: {result:?}");
    assert_eq!(result.unwrap().trim(), "embedded-deno-ok");
  }

  #[test]
  fn test_load_project_config_reads_json_output() {
    let runtime = DenoRuntime::new().unwrap();
    let tmp = TempDir::new().unwrap();
    let config_dir = tmp.path().join("app").join("myproject");
    std::fs::create_dir_all(&config_dir).unwrap();
    std::fs::write(
      config_dir.join("project.config.ts"),
      "console.log(JSON.stringify({ name: 'myproject', enabled: true }));",
    )
    .unwrap();

    let result = runtime.load_project_config(tmp.path(), "myproject", "app", tmp.path());
    assert!(
      result.is_ok(),
      "expected JSON project config, got: {result:?}"
    );
    assert_eq!(result.unwrap()["name"], "myproject");
  }

  #[test]
  fn test_execute_proxy_from_arbitrary_directory() {
    let runtime = DenoRuntime::new().unwrap();
    let tmp = TempDir::new().unwrap();
    let proxy_dir = tmp.path().join("skills").join("writer");
    std::fs::create_dir_all(&proxy_dir).unwrap();
    std::fs::write(
      proxy_dir.join("proxy.ts"),
      r#"
const ctx = globalThis.__tnmsContext ?? {}
console.log(`proxied/${ctx.logicalPath}`)
"#,
    )
    .unwrap();

    let result = runtime.execute_proxy(
      &proxy_dir.join("proxy.ts"),
      "notes/today.md",
      serde_json::json!({ "kind": "skill" }),
    );

    assert!(
      result.is_ok(),
      "expected arbitrary proxy execution, got: {result:?}"
    );
    assert_eq!(result.unwrap().trim(), "proxied/notes/today.md");
  }

  #[test]
  fn test_execute_ts_hides_untrusted_environment_by_default() {
    with_env_var("TNMSD_SECRET_TOKEN_FOR_TEST", "secret-value", || {
      let runtime = DenoRuntime::new().unwrap();
      let tmp = TempDir::new().unwrap();
      let script_path = tmp.path().join("env.ts");
      std::fs::write(
        &script_path,
        r#"
console.log(JSON.stringify({
  hasSecret: Deno.env.has("TNMSD_SECRET_TOKEN_FOR_TEST"),
  secret: Deno.env.get("TNMSD_SECRET_TOKEN_FOR_TEST") ?? null,
  envKeys: Object.keys(Deno.env.toObject())
}))
"#,
      )
      .unwrap();

      let result = runtime.execute_ts(&script_path, "{}").unwrap();
      let parsed: serde_json::Value = serde_json::from_str(result.trim()).unwrap();

      assert_eq!(parsed["hasSecret"], false);
      assert_eq!(parsed["secret"], serde_json::Value::Null);
      assert_eq!(parsed["envKeys"], serde_json::json!([]));
    });
  }

  #[test]
  fn test_execute_ts_exposes_only_allowed_environment_names() {
    with_env_var("TNMSD_ALLOWED_ENV_FOR_TEST", "visible-value", || {
      let runtime = DenoRuntime::new().unwrap();
      let tmp = TempDir::new().unwrap();
      let script_path = tmp.path().join("env.ts");
      std::fs::write(
        &script_path,
        r#"
console.log(JSON.stringify({
  allowed: Deno.env.get("TNMSD_ALLOWED_ENV_FOR_TEST") ?? null,
  keys: Object.keys(Deno.env.toObject())
}))
"#,
      )
      .unwrap();

      let context = serde_json::json!({
        "allowedEnv": ["TNMSD_ALLOWED_ENV_FOR_TEST", "TNMSD_MISSING_ENV_FOR_TEST"]
      });
      let result = runtime
        .execute_ts(&script_path, &context.to_string())
        .unwrap();
      let parsed: serde_json::Value = serde_json::from_str(result.trim()).unwrap();

      assert_eq!(parsed["allowed"], "visible-value");
      assert_eq!(
        parsed["keys"],
        serde_json::json!(["TNMSD_ALLOWED_ENV_FOR_TEST"])
      );
    });
  }
}
