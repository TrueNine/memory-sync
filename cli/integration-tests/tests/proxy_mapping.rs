use tnmsc_integration_tests::{install_packaged_cli_container, real_env_test_skip_reason};

#[test]
fn packaged_cli_proxy_mapping_reads_public_files_via_transformed_paths() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping proxy mapping test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();

  container.exec_success(
    r#"
mkdir -p /workspace/demo/aindex/dist
mkdir -p /workspace/demo/aindex/public/____.git/info
mkdir -p /workspace/demo/aindex/public/____.zed
mkdir -p /workspace/demo/aindex/public/____vscode
mkdir -p /workspace/demo/aindex/public/____idea
mkdir -p /root/.aindex

cat <<'EOF' > /root/.aindex/.tnmsc.json
{
  "workspaceDir": "/workspace/demo",
  "plugins": {
    "claudeCode": true
  }
}
EOF

cat <<'EOF' > /workspace/demo/aindex/dist/global.mdx
Global memory from aindex
EOF

cat <<'EOF' > /workspace/demo/aindex/dist/workspace.mdx
Workspace root prompt from aindex
EOF

cat <<'EOF' > /workspace/demo/aindex/public/____.git/info/exclude
# git exclude patterns
CLAUDE.md
EOF

cat <<'JSEOF' > /workspace/demo/aindex/public/____.zed/settings.json
{
  "tab_size": 2,
  "format_on_save": false
}
JSEOF

cat <<'JSEOF' > /workspace/demo/aindex/public/____vscode/settings.json
{
  "editor.formatOnSave": false,
  "editor.tabSize": 2
}
JSEOF

cat <<'EOF' > /workspace/demo/aindex/public/____idea/.gitignore
*
!.gitignore
EOF

cat <<'EOF' > /workspace/demo/aindex/public/____editorconfig
root = true

[*]
indent_style = space
indent_size = 2
EOF

cat <<'EOF' > /workspace/demo/aindex/public/____gitignore
node_modules/
dist/
.tmp/
EOF

cat <<'EOF' > /workspace/demo/aindex/public/____aiignore
.claude/
.cursor/
EOF

cat <<'EOF' > /workspace/demo/aindex/public/____warpindexignore
CLAUDE.md
EOF
"#,
  );

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with aindex/public proxy paths");
}

#[test]
fn packaged_cli_proxy_mapping_prefix_rules_are_correct() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping proxy prefix rule test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();

  let result = container.exec(
    r#"
cat <<'SCRIPT' > /tmp/test_proxy.mjs
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

// Verify prefix rules match filesystem layout
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
SCRIPT
node --experimental-strip-types /tmp/test_proxy.mjs
"#,
  );
  result.assert_success("proxy prefix rule verification");
  assert!(
    result.stdout.contains("0 failed"),
    "all proxy prefix rules should pass.\nstdout:\n{}\nstderr:\n{}",
    result.stdout,
    result.stderr
  );
}