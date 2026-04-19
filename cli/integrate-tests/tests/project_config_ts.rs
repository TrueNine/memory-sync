use serde_json::Value;
use tnmsc_integrate_tests::install_packaged_cli_container;

fn read_aindex_resolvers(container: &tnmsc_integrate_tests::TestContainer) -> Value {
  let result = container
    .exec("/test-bin/tnmsc-test-api collect-aindex-resolvers --workspace-dir '/workspace/demo'");
  result.assert_success("collect-aindex-resolvers");
  serde_json::from_str(&result.stdout).expect("resolver output should be valid JSON")
}

#[test]
fn packaged_cli_collects_project_config_ts_for_supported_series_and_ignores_workspace_root_mirrors()
{
  let container = install_packaged_cli_container();

  container
    .setup()
    .mkdir_p("/workspace/demo/aindex/app/app-a")
    .mkdir_p("/workspace/demo/aindex/arch/arch-a")
    .mkdir_p("/workspace/demo/aindex/softwares/software-a")
    .mkdir_p("/workspace/demo/aindex/ext/ext-a")
    .mkdir_p("/workspace/demo/app/app-a")
    .mkdir_p("/workspace/demo/arch/arch-a")
    .mkdir_p("/workspace/demo/softwares/software-a")
    .mkdir_p("/workspace/demo/ext/ext-a")
    .write_file(
      "/workspace/demo/aindex/app/app-a/project.config.ts",
      r#"
const ctx = globalThis.__tnmsContext ?? {};
console.log(JSON.stringify({
  source: 'aindex',
  projectName: ctx.projectName,
  seriesName: ctx.seriesName,
  marker: 'app-ok'
}));
"#,
    )
    .write_file(
      "/workspace/demo/aindex/arch/arch-a/project.config.ts",
      r#"
const ctx = globalThis.__tnmsContext ?? {};
console.log(JSON.stringify({
  source: 'aindex',
  projectName: ctx.projectName,
  seriesName: ctx.seriesName,
  marker: 'arch-ok'
}));
"#,
    )
    .write_file(
      "/workspace/demo/aindex/softwares/software-a/project.config.ts",
      r#"
const ctx = globalThis.__tnmsContext ?? {};
console.log(JSON.stringify({
  source: 'aindex',
  projectName: ctx.projectName,
  seriesName: ctx.seriesName,
  marker: 'software-ok'
}));
"#,
    )
    .write_file(
      "/workspace/demo/aindex/ext/ext-a/project.config.ts",
      r#"
const ctx = globalThis.__tnmsContext ?? {};
console.log(JSON.stringify({
  source: 'aindex',
  projectName: ctx.projectName,
  seriesName: ctx.seriesName,
  marker: 'ext-ok'
}));
"#,
    )
    .write_file(
      "/workspace/demo/app/app-a/project.config.ts",
      r#"console.log(JSON.stringify({ source: 'workspace-root', marker: 'wrong-app' }));"#,
    )
    .write_file(
      "/workspace/demo/arch/arch-a/project.config.ts",
      r#"console.log(JSON.stringify({ source: 'workspace-root', marker: 'wrong-arch' }));"#,
    )
    .write_file(
      "/workspace/demo/softwares/software-a/project.config.ts",
      r#"console.log(JSON.stringify({ source: 'workspace-root', marker: 'wrong-software' }));"#,
    )
    .write_file(
      "/workspace/demo/ext/ext-a/project.config.ts",
      r#"console.log(JSON.stringify({ source: 'workspace-root', marker: 'wrong-ext' }));"#,
    )
    .exec("setup project.config.ts positive workspace");

  let parsed = read_aindex_resolvers(&container);
  let projects = parsed["workspace"]["projects"]
    .as_array()
    .expect("projects should be an array");

  let expected = [
    ("app", "app-a", "app-ok"),
    ("arch", "arch-a", "arch-ok"),
    ("softwares", "software-a", "software-ok"),
    ("ext", "ext-a", "ext-ok"),
  ];

  for (series, project, marker) in expected {
    let item = projects
      .iter()
      .find(|entry| {
        entry["projectType"].as_str() == Some(series) && entry["name"].as_str() == Some(project)
      })
      .unwrap_or_else(|| panic!("missing project {series}:{project}"));

    assert_eq!(item["projectConfig"]["source"], "aindex");
    assert_eq!(item["projectConfig"]["projectName"], project);
    assert_eq!(item["projectConfig"]["seriesName"], series);
    assert_eq!(item["projectConfig"]["marker"], marker);
  }
}

#[test]
fn packaged_cli_reports_invalid_project_config_ts_without_failing_collection() {
  let container = install_packaged_cli_container();

  container
    .setup()
    .mkdir_p("/workspace/demo/aindex/app/app-a")
    .mkdir_p("/workspace/demo/aindex/ext/ext-a")
    .write_file(
      "/workspace/demo/aindex/app/app-a/project.config.ts",
      r#"
const ctx = globalThis.__tnmsContext ?? {};
console.log(JSON.stringify({
  source: 'aindex',
  projectName: ctx.projectName,
  seriesName: ctx.seriesName,
  marker: 'ok'
}));
"#,
    )
    .write_file(
      "/workspace/demo/aindex/ext/ext-a/project.config.ts",
      "console.log('{ invalid json');",
    )
    .exec("setup invalid project.config.ts workspace");

  let parsed = read_aindex_resolvers(&container);
  let projects = parsed["workspace"]["projects"]
    .as_array()
    .expect("projects should be an array");
  let ext_project = projects
    .iter()
    .find(|entry| {
      entry["projectType"].as_str() == Some("ext") && entry["name"].as_str() == Some("ext-a")
    })
    .expect("missing ext project");

  assert!(
    ext_project["projectConfig"].is_null(),
    "invalid project.config.ts should not populate projectConfig"
  );

  let diagnostics = parsed["diagnostics"]
    .as_array()
    .expect("diagnostics should be an array");
  assert!(
    diagnostics
      .iter()
      .any(|diagnostic| diagnostic["code"] == "AINDEX_PROJECT_CONFIG_TS_INVALID"),
    "invalid project.config.ts should emit AINDEX_PROJECT_CONFIG_TS_INVALID diagnostic"
  );
}

#[test]
fn packaged_tnmsc_does_not_expose_aindex_resolver_test_subcommand() {
  let container = install_packaged_cli_container();
  let result = container.exec_tnmsc(&[
    "collect-aindex-resolvers",
    "--workspace-dir",
    "/workspace/demo",
  ]);

  result.assert_failure("packaged tnmsc should not expose collect-aindex-resolvers");
  assert!(
    result
      .stderr
      .contains("unrecognized subcommand 'collect-aindex-resolvers'"),
    "unexpected stderr:\n{}",
    result.stderr
  );
}
