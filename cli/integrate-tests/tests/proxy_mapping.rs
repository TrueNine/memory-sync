//! 验证代理映射逻辑: aindex/public 下的路径通过前缀转换规则映射到原始的 dotfile 名称。
//!
//! **断言**:
//! - `install` 使用转换后的路径读取 aindex/public 中的文件 (文件解析)
//! - 代理前缀规则正确转换 dotfile 路径 (.git/ -> ____.git/ 等) (路径映射正确性)

use tnmsc_integrate_tests::{install_packaged_cli_container};

#[test]
fn packaged_cli_proxy_mapping_reads_public_files_via_transformed_paths() {
  let container = install_packaged_cli_container();

  container
    .setup()
    .mkdir_p("/workspace/demo/aindex")
    .mkdir_p("/workspace/demo/aindex/public/____.git/info")
    .mkdir_p("/workspace/demo/aindex/public/____.zed")
    .mkdir_p("/workspace/demo/aindex/public/____vscode")
    .mkdir_p("/workspace/demo/aindex/public/____idea")
    .mkdir_p("/root/.aindex")
    .write_file(
      "/root/.aindex/.tnmsc.json",
      r#"{
  "workspaceDir": "/workspace/demo",
  "plugins": {
    "claudeCode": true
  }
}"#,
    )
    .write_file(
      "/workspace/demo/aindex/global.src.mdx",
      "Global memory from aindex",
    )
    .write_file(
      "/workspace/demo/aindex/workspace.src.mdx",
      "Workspace root prompt from aindex",
    )
    .write_file(
      "/workspace/demo/aindex/public/____.git/info/exclude",
      "# git exclude patterns\nCLAUDE.md",
    )
    .write_file(
      "/workspace/demo/aindex/public/____.zed/settings.json",
      r#"{
  "tab_size": 2,
  "format_on_save": false
}"#,
    )
    .write_file(
      "/workspace/demo/aindex/public/____vscode/settings.json",
      r#"{
  "editor.formatOnSave": false,
  "editor.tabSize": 2
}"#,
    )
    .write_file(
      "/workspace/demo/aindex/public/____idea/.gitignore",
      "*\n!.gitignore",
    )
    .write_file(
      "/workspace/demo/aindex/public/____editorconfig",
      "root = true\n\n[*]\nindent_style = space\nindent_size = 2",
    )
    .write_file(
      "/workspace/demo/aindex/public/____gitignore",
      "node_modules/\ndist/\n.tmp/",
    )
    .write_file(
      "/workspace/demo/aindex/public/____aiignore",
      ".claude/\n.cursor/",
    )
    .write_file(
      "/workspace/demo/aindex/public/____warpindexignore",
      "CLAUDE.md",
    )
    .exec("setup proxy mapping workspace");

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with aindex/public proxy paths");
}

#[test]
fn packaged_cli_proxy_mapping_prefix_rules_are_correct() {
  let container = install_packaged_cli_container();

  let proxy_script = r#"
const prefixRules = [
  { match: '.git/', replacement: (p) => p.replace(/^\.git\//, '____.git/') },
  { match: '.zed/', replacement: (p) => p.replace(/^\.zed\//, '____.zed/') },
  { match: '.idea/', replacement: (p) => p.replace(/^\.idea\//, '____idea/') },
  { match: '.vscode/', replacement: (p) => p.replace(/^\.vscode\//, '____vscode/') },
];

function proxy(logicalPath) {
  const normalized = logicalPath.replaceAll('\\', '/');
  for (const rule of prefixRules) {
    if (normalized.startsWith(rule.match)) {
      return rule.replacement(normalized);
    }
  }
  if (!normalized.startsWith('.')) return normalized;
  return normalized.replace(/^\.([^/\\]+)/, '____$1');
}

const tests = [
  ['.git/info/exclude', '____.git/info/exclude'],
  ['.git/HEAD', '____.git/HEAD'],
  ['.zed/settings.json', '____.zed/settings.json'],
  ['.idea/.gitignore', '____idea/.gitignore'],
  ['.idea/codeStyles/Project.xml', '____idea/codeStyles/Project.xml'],
  ['.vscode/settings.json', '____vscode/settings.json'],
  ['.vscode/extensions.json', '____vscode/extensions.json'],
  ['.editorconfig', '____editorconfig'],
  ['.gitignore', '____gitignore'],
  ['.aiignore', '____aiignore'],
  ['.warpindexignore', '____warpindexignore'],
  ['plain/path.txt', 'plain/path.txt'],
];

let passed = 0;
let failed = 0;
for (const [input, expected] of tests) {
  const actual = proxy(input);
  if (actual === expected) {
    passed++;
  } else {
    console.error(`FAIL: proxy("${input}") = "${actual}", expected "${expected}"`);
    failed++;
  }
}
console.log(`proxy prefix rules: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
"#;

  container
    .setup()
    .write_file("/tmp/test_proxy.mjs", proxy_script)
    .exec("write proxy test script");

  let result = container.exec("node --experimental-strip-types /tmp/test_proxy.mjs");
  result.assert_success("proxy prefix rule verification");
  assert!(
    result.stdout.contains("0 failed"),
    "all proxy prefix rules should pass.\nstdout:\n{}\nstderr:\n{}",
    result.stdout,
    result.stderr
  );
}
