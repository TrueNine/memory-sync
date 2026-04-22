use tnmsc_integrate_tests::install_packaged_cli_container;

fn proxy_script(prefix: &str) -> String {
  format!(
    r#"
const ctx = globalThis.__tnmsContext ?? {{}};
const logicalPath = String(ctx.logicalPath ?? '').replaceAll('\\', '/');
console.log('{prefix}/' + logicalPath);
"#
  )
}

#[test]
fn packaged_cli_resolves_proxy_ts_from_all_supported_aindex_locations() {
  let container = install_packaged_cli_container().unwrap();

  container
    .setup()
    .mkdir_p("/workspace/demo/aindex/app/proj-a")
    .mkdir_p("/workspace/demo/aindex/arch/arch-a")
    .mkdir_p("/workspace/demo/aindex/softwares/tool-a")
    .mkdir_p("/workspace/demo/aindex/ext/ext-a")
    .mkdir_p("/workspace/demo/aindex/commands/cmd-a")
    .mkdir_p("/workspace/demo/aindex/skills/skill-a")
    .mkdir_p("/workspace/demo/aindex/subagents/agent-a")
    .write_file(
      "/workspace/demo/aindex/app/proj-a/proxy.ts",
      &proxy_script("app-proxy"),
    )
    .write_file(
      "/workspace/demo/aindex/arch/arch-a/proxy.ts",
      &proxy_script("arch-proxy"),
    )
    .write_file(
      "/workspace/demo/aindex/softwares/tool-a/proxy.ts",
      &proxy_script("software-proxy"),
    )
    .write_file(
      "/workspace/demo/aindex/ext/ext-a/proxy.ts",
      &proxy_script("ext-proxy"),
    )
    .write_file(
      "/workspace/demo/aindex/commands/cmd-a/proxy.ts",
      &proxy_script("command-proxy"),
    )
    .write_file(
      "/workspace/demo/aindex/skills/skill-a/proxy.ts",
      &proxy_script("skill-proxy"),
    )
    .write_file(
      "/workspace/demo/aindex/subagents/agent-a/proxy.ts",
      &proxy_script("subagent-proxy"),
    )
    .exec("setup aindex proxy.ts locations");

  let cases = [
    (
      "/workspace/demo/aindex/app/proj-a/proxy.ts",
      "/workspace/demo/aindex/app/proj-a",
      "nested/file.txt",
      "app-proxy/nested/file.txt",
    ),
    (
      "/workspace/demo/aindex/arch/arch-a/proxy.ts",
      "/workspace/demo/aindex/arch/arch-a",
      "notes/today.md",
      "arch-proxy/notes/today.md",
    ),
    (
      "/workspace/demo/aindex/softwares/tool-a/proxy.ts",
      "/workspace/demo/aindex/softwares/tool-a",
      "assets/logo.svg",
      "software-proxy/assets/logo.svg",
    ),
    (
      "/workspace/demo/aindex/ext/ext-a/proxy.ts",
      "/workspace/demo/aindex/ext/ext-a",
      "config/settings.json",
      "ext-proxy/config/settings.json",
    ),
    (
      "/workspace/demo/aindex/commands/cmd-a/proxy.ts",
      "/workspace/demo/aindex/commands/cmd-a",
      "docs/usage.md",
      "command-proxy/docs/usage.md",
    ),
    (
      "/workspace/demo/aindex/skills/skill-a/proxy.ts",
      "/workspace/demo/aindex/skills/skill-a",
      "outputs/result.txt",
      "skill-proxy/outputs/result.txt",
    ),
    (
      "/workspace/demo/aindex/subagents/agent-a/proxy.ts",
      "/workspace/demo/aindex/subagents/agent-a",
      "plans/spec.md",
      "subagent-proxy/plans/spec.md",
    ),
  ];

  for (proxy_path, root_dir, logical_path, expected) in cases {
    let result = container.exec(&format!(
      "/test-bin/tnmsc-test-api resolve-proxy-path --proxy-path '{}' --root-dir '{}' --logical-path '{}'",
      proxy_path, root_dir, logical_path
    ));
    result.assert_success("resolve-proxy-path");
    assert_eq!(result.stdout.trim(), expected);
  }
}

#[test]
fn packaged_tnmsc_does_not_expose_proxy_test_subcommand() {
  let container = install_packaged_cli_container().unwrap();
  let result = container.exec_tnmsc(&[
    "resolve-proxy-path",
    "--proxy-path",
    "/tmp/proxy.ts",
    "--root-dir",
    "/tmp",
    "--logical-path",
    "demo.txt",
  ]);

  result.assert_failure("packaged tnmsc should not expose resolve-proxy-path");
  assert!(
    result
      .stderr
      .contains("unrecognized subcommand 'resolve-proxy-path'"),
    "unexpected stderr:\n{}",
    result.stderr
  );
}
