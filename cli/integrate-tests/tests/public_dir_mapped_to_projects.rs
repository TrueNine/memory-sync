use tnmsc_integrate_tests::{
  TestContainer, install_packaged_cli_container,
};

fn setup_workspace_with_public_files(container: &TestContainer) {
  container
    .setup()
    .mkdir_p("/workspace/demo/project-a/aindex/dist")
    .mkdir_p("/workspace/demo/aindex/dist/app/project-a")
    .mkdir_p("/workspace/demo/aindex/public/____.git/info")
    .mkdir_p("/workspace/demo/aindex/public/____.zed")
    .mkdir_p("/workspace/demo/aindex/public/____vscode")
    .mkdir_p("/workspace/demo/aindex/public/____idea/codeStyles")
    .mkdir_p("/workspace/demo/aindex/public/____idea")
    .mkdir_p("/root/.aindex")
    .write_file(
      "/root/.aindex/.tnmsc.json",
      r#"{
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
}"#,
    )
    .write_file("/workspace/demo/aindex/dist/global.mdx", "Global memory from aindex")
    .write_file(
      "/workspace/demo/aindex/dist/workspace.mdx",
      "Workspace root prompt from aindex",
    )
    .write_file(
      "/workspace/demo/aindex/dist/app/project-a/AGENTS.md",
      "Project A memory",
    )
    .write_file(
      "/workspace/demo/aindex/public/____.git/info/exclude",
      "# aindex managed git exclude\nCLAUDE.md\n.tmp/\nnode_modules/",
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
  "editor.tabSize": 2,
  "files.autoSave": "afterDelay"
}"#,
    )
    .write_file(
      "/workspace/demo/aindex/public/____vscode/extensions.json",
      r#"{
  "recommendations": []
}"#,
    )
    .write_file(
      "/workspace/demo/aindex/public/____idea/.gitignore",
      "*\n!.gitignore\n!codeStyles/\n!codeStyles/codeStyleConfig.xml\n!codeStyles/Project.xml",
    )
    .write_file(
      "/workspace/demo/aindex/public/____idea/codeStyles/Project.xml",
      r#"<component name="ProjectCodeStyleConfiguration">
  <code_scheme name="Project" version="173" />
</component>"#,
    )
    .write_file(
      "/workspace/demo/aindex/public/____idea/codeStyles/codeStyleConfig.xml",
      r#"<component name="CodeStyleSchemes">
  <option name="CURRENT_SCHEME_NAME" value="Project" />
</component>"#,
    )
    .write_file(
      "/workspace/demo/aindex/public/____editorconfig",
      "root = true\n\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\ninsert_final_newline = true",
    )
    .write_file(
      "/workspace/demo/aindex/public/____gitignore",
      "node_modules/\ndist/\n.tmp/\n*.log",
    )
    .write_file(
      "/workspace/demo/aindex/public/____aiignore",
      ".claude/\n.cursor/\n.kiro/\n.skills/",
    )
    .write_file(
      "/workspace/demo/aindex/public/____warpindexignore",
      "CLAUDE.md\nAGENTS.md",
    )
    .exec("setup public-dir-mapped workspace");
}

#[test]
fn vscode_settings_written_to_project_from_public_dir() {
  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with vscode plugin");

  let vscode_settings = container.cat_success("/workspace/demo/project-a/.vscode/settings.json");
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
  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with vscode plugin");

  let vscode_ext = container.cat_success("/workspace/demo/project-a/.vscode/extensions.json");
  assert!(
    vscode_ext.stdout.contains("recommendations"),
    "project-a/.vscode/extensions.json should contain recommendations.\nstdout:\n{}",
    vscode_ext.stdout
  );
}

#[test]
fn zed_settings_written_to_project_from_public_dir() {
  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with zed plugin");

  let zed_settings = container.cat_success("/workspace/demo/project-a/.zed/settings.json");
  assert!(
    zed_settings.stdout.contains("tab_size"),
    "project-a/.zed/settings.json should contain tab_size.\nstdout:\n{}",
    zed_settings.stdout
  );
}

#[test]
fn git_exclude_written_to_project_from_public_dir() {
  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  container.exec_success("git init /workspace/demo >/dev/null 2>&1");

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with git plugin");

  let git_exclude = container.cat_success("/workspace/demo/.git/info/exclude");
  assert!(
    git_exclude.stdout.contains("CLAUDE.md"),
    ".git/info/exclude should contain CLAUDE.md from aindex/public.\nstdout:\n{}",
    git_exclude.stdout
  );
}

#[test]
fn editorconfig_written_to_project_from_public_dir() {
  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with editorconfig");

  let editorconfig = container.cat_success("/workspace/demo/project-a/.editorconfig");
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
  let container = install_packaged_cli_container();
  setup_workspace_with_public_files(&container);

  container.exec_success("git init /workspace/demo >/dev/null 2>&1");

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("tnmsc install with git plugin");

  let git_exclude = container.cat_success("/workspace/demo/.git/info/exclude");
  assert!(
    git_exclude.stdout.contains("node_modules/"),
    "git exclude should contain gitignore content from aindex/public.\nstdout:\n{}",
    git_exclude.stdout
  );
}
