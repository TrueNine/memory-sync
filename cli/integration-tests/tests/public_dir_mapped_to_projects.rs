use tnmsc_integration_tests::{install_packaged_cli_container, real_env_test_skip_reason};

fn setup_workspace_with_public_files(container: &tnmsc_integration_tests::TestContainer) {
  container.exec_success(
    r#"
mkdir -p /workspace/demo/project-a/aindex/dist
mkdir -p /workspace/demo/aindex/dist/app/project-a
mkdir -p /workspace/demo/aindex/public/____.git/info
mkdir -p /workspace/demo/aindex/public/____.zed
mkdir -p /workspace/demo/aindex/public/____vscode
mkdir -p /workspace/demo/aindex/public/____idea/codeStyles
mkdir -p /workspace/demo/aindex/public/____idea
mkdir -p /root/.aindex

cat <<'CONF' > /root/.aindex/.tnmsc.json
{
  "workspaceDir": "/workspace/demo",
  "plugins": {
    "claudeCode": true,
    "vscode": true,
    "zed": true,
    "git": true,
    "readme": true,
    "jetbrains": true,
    "jetbrainsCodeStyle": true
  }
}
CONF

cat <<'EOF' > /workspace/demo/aindex/dist/global.mdx
Global memory from aindex
EOF

cat <<'EOF' > /workspace/demo/aindex/dist/workspace.mdx
Workspace root prompt from aindex
EOF

cat <<'MDX' > /workspace/demo/aindex/dist/app/project-a/AGENTS.md
Project A memory
MDX

cat <<'EOF' > /workspace/demo/aindex/public/____.git/info/exclude
# aindex managed git exclude
CLAUDE.md
.tmp/
node_modules/
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
  "editor.tabSize": 2,
  "files.autoSave": "afterDelay"
}
JSEOF

cat <<'JSEOF' > /workspace/demo/aindex/public/____vscode/extensions.json
{
  "recommendations": []
}
JSEOF

cat <<'EOF' > /workspace/demo/aindex/public/____idea/.gitignore
*
!.gitignore
!codeStyles/
!codeStyles/codeStyleConfig.xml
!codeStyles/Project.xml
EOF

cat <<'XML' > /workspace/demo/aindex/public/____idea/codeStyles/Project.xml
<component name="ProjectCodeStyleConfiguration">
  <code_scheme name="Project" version="173" />
</component>
XML

cat <<'XML' > /workspace/demo/aindex/public/____idea/codeStyles/codeStyleConfig.xml
<component name="CodeStyleSchemes">
  <option name="CURRENT_SCHEME_NAME" value="Project" />
</component>
XML

cat <<'EOF' > /workspace/demo/aindex/public/____editorconfig
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
EOF

cat <<'EOF' > /workspace/demo/aindex/public/____gitignore
node_modules/
dist/
.tmp/
*.log
EOF

cat <<'EOF' > /workspace/demo/aindex/public/____aiignore
.claude/
.cursor/
.kiro/
.skills/
EOF

cat <<'EOF' > /workspace/demo/aindex/public/____warpindexignore
CLAUDE.md
AGENTS.md
EOF
"#,
  );
}

#[test]
fn vscode_settings_written_to_project_from_public_dir() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping vscode settings test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with vscode plugin");

  let vscode_settings = container.exec("cat /workspace/demo/project-a/.vscode/settings.json");
  vscode_settings.assert_success("read project-a/.vscode/settings.json");
  assert!(
    vscode_settings.stdout.contains("editor.tabSize"),
    "project-a/.vscode/settings.json should contain editor.tabSize.\nstdout:\n{}",
    vscode_settings.stdout
  );
  assert!(
    vscode_settings.stdout.contains("formatOnSave"),
    "project-a/.vscode/settings.json should contain formatOnSave.\nstdout:\n{}",
    vscode_settings.stdout
  );
}

#[test]
fn vscode_extensions_written_to_project_from_public_dir() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping vscode extensions test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with vscode plugin");

  let vscode_ext = container.exec("cat /workspace/demo/project-a/.vscode/extensions.json");
  vscode_ext.assert_success("read project-a/.vscode/extensions.json");
  assert!(
    vscode_ext.stdout.contains("recommendations"),
    "project-a/.vscode/extensions.json should contain recommendations.\nstdout:\n{}",
    vscode_ext.stdout
  );
}

#[test]
fn zed_settings_written_to_project_from_public_dir() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping zed settings test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with zed plugin");

  let zed_settings = container.exec("cat /workspace/demo/project-a/.zed/settings.json");
  zed_settings.assert_success("read project-a/.zed/settings.json");
  assert!(
    zed_settings.stdout.contains("tab_size"),
    "project-a/.zed/settings.json should contain tab_size.\nstdout:\n{}",
    zed_settings.stdout
  );
}

#[test]
fn git_exclude_written_to_project_from_public_dir() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping git exclude test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  container.exec_success("git init /workspace/demo >/dev/null 2>&1");

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with git plugin");

  let git_exclude = container.exec("cat /workspace/demo/.git/info/exclude");
  git_exclude.assert_success("read .git/info/exclude");
  assert!(
    git_exclude.stdout.contains("CLAUDE.md"),
    ".git/info/exclude should contain CLAUDE.md from aindex/public.\nstdout:\n{}",
    git_exclude.stdout
  );
}

#[test]
fn editorconfig_written_to_project_from_public_dir() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping editorconfig test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with editorconfig");

  let editorconfig = container.exec("cat /workspace/demo/project-a/.editorconfig");
  editorconfig.assert_success("read project-a/.editorconfig");
  assert!(
    editorconfig.stdout.contains("indent_size"),
    "project-a/.editorconfig should contain indent_size.\nstdout:\n{}",
    editorconfig.stdout
  );
  assert!(
    editorconfig.stdout.contains("indent_style"),
    "project-a/.editorconfig should contain indent_style.\nstdout:\n{}",
    editorconfig.stdout
  );
}

#[test]
fn gitignore_content_read_from_public_dir() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping gitignore read test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  container.exec_success("git init /workspace/demo >/dev/null 2>&1");

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with git plugin");

  let git_exclude = container.exec("cat /workspace/demo/.git/info/exclude");
  git_exclude.assert_success("read git exclude");
  assert!(
    git_exclude.stdout.contains("node_modules/"),
    "git exclude should contain gitignore content from aindex/public.\nstdout:\n{}",
    git_exclude.stdout
  );
}