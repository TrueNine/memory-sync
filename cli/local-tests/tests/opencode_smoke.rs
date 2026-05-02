//! Isolated opencode smoke tests for OpencodeCLIOutputAdaptor.
//!
//! These tests use a temporary HOME/workspace fixture so opencode output
//! checks do not depend on the caller's real `~/.aindex/.tnmsc.json`,
//! `~/.config/opencode`, or host workspace prompts.

#[path = "support/opencode.rs"]
mod opencode_support;

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use opencode_support::{
  IsolatedOpencodeFixture, collect_file_names, expected_installed_skill_names,
};

#[test]
fn local_opencode_install_generates_project_agents_md() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode");

  assert!(
    fixture.project_agents_path().is_file(),
    "project .opencode/AGENTS.md should be generated after install"
  );

  let content = fs::read_to_string(fixture.project_agents_path()).unwrap();
  assert!(
    !content.is_empty(),
    ".opencode/AGENTS.md should not be empty"
  );

  for subdir in ["agents", "skills", "commands", "rules"] {
    assert!(
      fixture.project_opencode_dir().join(subdir).is_dir(),
      "project .opencode/{subdir} should exist after install"
    );
  }

  let agent_files: Vec<_> = fs::read_dir(fixture.project_agents_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !agent_files.is_empty(),
    "project .opencode/agents should contain at least one file"
  );
  for file in &agent_files {
    let name = file.file_name().to_string_lossy().to_string();
    let content = fs::read_to_string(file.path()).unwrap();
    assert!(name.ends_with(".md"));
    assert!(content.starts_with("---\n"));
    assert!(content.contains("agent:"));
    assert!(
      content.contains("mode: subagent") || content.contains("mode: \"subagent\""),
      "agent file {} should contain mode: \"subagent\" in front matter",
      name
    );
  }

  let command_files: Vec<_> = fs::read_dir(fixture.project_commands_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !command_files.is_empty(),
    "project .opencode/commands should contain at least one file"
  );
  for file in &command_files {
    let name = file.file_name().to_string_lossy().to_string();
    let content = fs::read_to_string(file.path()).unwrap();
    assert!(name.ends_with(".md"));
    assert!(content.starts_with("---\n"));
    assert!(content.contains("command:"));
  }

  let skill_dirs: Vec<_> = fs::read_dir(fixture.project_skills_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
    .collect();
  assert!(
    !skill_dirs.is_empty(),
    "project .opencode/skills should contain at least one subdirectory"
  );
  for entry in &skill_dirs {
    let name = entry.file_name().to_string_lossy().to_string();
    let skill_md_path = entry.path().join("SKILL.md");
    assert!(
      skill_md_path.is_file(),
      "skill directory {} should contain SKILL.md",
      name
    );
    let content = fs::read_to_string(skill_md_path).unwrap();
    assert!(content.starts_with("---\n"));
    assert!(content.contains("skill:"));
  }

  let all_rule_files = collect_rule_files(&fixture.project_rules_dir());
  assert!(
    !all_rule_files.is_empty(),
    "project .opencode/rules should contain at least one file"
  );
  for file_path in &all_rule_files {
    let name = file_path.file_name().unwrap().to_string_lossy().to_string();
    let stem = &name[5..name.len() - 3];
    let content = fs::read_to_string(file_path).unwrap();

    assert!(
      name.starts_with("rule-") && name.ends_with(".md"),
      "every file in .opencode/rules must match 'rule-*.md', got: {}",
      name
    );
    assert!(
      !stem.is_empty() && !stem.contains('.'),
      "rule file stem must be non-empty and dot-free, got: {}",
      name
    );
    assert!(content.starts_with("---\n"));
    assert!(content.contains("rule:"));
    assert!(
      !content.contains("\nglobs:\n"),
      "rule file {} must not contain 'globs:'",
      name
    );
    assert!(
      content.contains("\npaths:\n"),
      "rule file {} must contain 'paths:'",
      name
    );
  }
}

#[test]
fn local_opencode_install_generates_global_agents_md() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode");

  assert!(
    fixture.global_agents_path().is_file(),
    "~/.config/opencode/AGENTS.md should be generated after install"
  );
  assert!(
    !fs::read_to_string(fixture.global_agents_path())
      .unwrap()
      .trim()
      .is_empty(),
    "~/.config/opencode/AGENTS.md should not be empty"
  );
}

#[test]
fn local_opencode_install_idempotent() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");

  let first = fixture.install();
  first.assert_success("first isolated tnmsc install for opencode");
  assert!(
    fixture.project_agents_path().is_file(),
    ".opencode/AGENTS.md should exist after first install"
  );
  let content_first = fs::read_to_string(fixture.project_agents_path()).unwrap();

  let second = fixture.install();
  second.assert_success("second isolated tnmsc install for opencode");
  let content_second = fs::read_to_string(fixture.project_agents_path()).unwrap();

  assert_eq!(
    content_first, content_second,
    "consecutive installs should produce identical .opencode/AGENTS.md"
  );
  assert!(
    fixture.global_agents_path().is_file(),
    "~/.config/opencode/AGENTS.md should exist after install"
  );
}

#[test]
fn local_opencode_clean_removes_files() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .install()
    .assert_success("isolated tnmsc install before opencode clean");
  assert!(
    fixture.project_agents_path().is_file(),
    ".opencode/AGENTS.md should exist after install"
  );

  fixture
    .clean()
    .assert_success("isolated tnmsc clean for opencode");

  assert!(
    !fixture.project_agents_path().exists(),
    ".opencode/AGENTS.md should be removed after clean"
  );
  assert!(
    !fixture.child_agents_path().exists(),
    "nested child .opencode/AGENTS.md should be removed after clean"
  );
}

#[test]
fn local_opencode_dry_run_does_not_write() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode dry-run");
  assert!(
    !fixture.project_agents_path().exists(),
    ".opencode/AGENTS.md should not exist before dry-run"
  );
  assert!(
    !fixture.global_agents_path().exists(),
    "~/.config/opencode/AGENTS.md should not exist before dry-run"
  );

  fixture
    .dry_run()
    .assert_success("isolated tnmsc dry-run for opencode");

  assert!(
    !fixture.project_agents_path().exists(),
    ".opencode/AGENTS.md should not be created by dry-run"
  );
  assert!(
    !fixture.global_agents_path().exists(),
    "~/.config/opencode/AGENTS.md should not be created by dry-run"
  );
}

#[test]
fn local_opencode_global_md_url_interpolation() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode interpolation");

  let content = fs::read_to_string(fixture.global_agents_path()).unwrap();
  assert!(
    content.contains("TrueNine"),
    "inline expression should be evaluated to TrueNine\ngot:\n{content}"
  );
  assert!(
    content.contains("[TrueNineGithub]"),
    "link text interpolation should be evaluated\ngot:\n{content}"
  );
  assert!(
    content.contains("https://github.com/TrueNine"),
    "URL interpolation should be evaluated\ngot:\n{content}"
  );
  assert!(
    !content.contains("github.com/{profile"),
    "unreplaced URL interpolation found\ngot:\n{content}"
  );
}

#[test]
fn local_opencode_project_content_includes_workspace_memory() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode content checks");

  let project_content = fs::read_to_string(fixture.project_agents_path()).unwrap();
  let global_content = fs::read_to_string(fixture.global_agents_path()).unwrap();

  assert!(
    project_content.len() >= global_content.len(),
    "project .opencode/AGENTS.md should be at least as long as global content"
  );
  assert!(
    project_content.contains("TrueNine"),
    "project .opencode/AGENTS.md should contain global memory content"
  );
  assert!(
    project_content.contains("Project root instructions"),
    "project .opencode/AGENTS.md should contain project memory content"
  );
}

#[test]
fn local_opencode_agent_md_should_not_contain_model_field() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode agent checks");

  let agent_files: Vec<_> = fs::read_dir(fixture.project_agents_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !agent_files.is_empty(),
    ".opencode/agents should contain at least one file"
  );

  for file in &agent_files {
    // issue #382: opencode generated agents must strip the future-only `model`
    // field so current schema validation keeps passing.
    let content = fs::read_to_string(file.path()).unwrap();
    assert!(
      !content.contains("\nmodel:"),
      "agent file {} must not contain 'model:' field",
      file.file_name().to_string_lossy()
    );
  }
}

#[test]
fn local_opencode_agent_md_must_include_subagent_mode() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode agent mode checks");

  let agent_files: Vec<_> = fs::read_dir(fixture.project_agents_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !agent_files.is_empty(),
    ".opencode/agents should contain at least one file"
  );

  for file in &agent_files {
    let content = fs::read_to_string(file.path()).unwrap();
    assert!(
      content.contains("mode: subagent") || content.contains("mode: \"subagent\""),
      "agent file {} must include mode: \"subagent\" in YAML front matter",
      file.file_name().to_string_lossy()
    );
  }
}

#[test]
fn local_opencode_agent_md_color_must_be_hex_format() {
  fn is_valid_hex_color(s: &str) -> bool {
    if s.len() != 7 {
      return false;
    }
    let bytes = s.as_bytes();
    if bytes[0] != b'#' {
      return false;
    }
    bytes[1..].iter().all(|byte| byte.is_ascii_hexdigit())
  }

  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode color checks");

  let agent_files: Vec<_> = fs::read_dir(fixture.project_agents_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !agent_files.is_empty(),
    ".opencode/agents should contain at least one file"
  );

  for file in &agent_files {
    let content = fs::read_to_string(file.path()).unwrap();
    let file_name = file.file_name().to_string_lossy().to_string();

    for line in content.lines() {
      let trimmed = line.trim();
      if let Some(color_value) = trimmed.strip_prefix("color:") {
        let color_value = color_value.trim().trim_matches('"').trim_matches('\'');
        assert!(
          is_valid_hex_color(color_value),
          "agent file {} has invalid color '{}': must match #RRGGBB",
          file_name,
          color_value
        );
      }
    }
  }
}

#[test]
fn local_opencode_child_memory_generates_nested_agents_md() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode child-memory install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode child-memory checks");

  // issue #380: opencode child prompts must materialize nested
  // `.opencode/AGENTS.md` files so per-directory memory remains reachable.
  assert!(
    fixture.child_agents_path().is_file(),
    "child .github/.opencode/AGENTS.md should be generated from child prompt"
  );

  let child_content = fs::read_to_string(fixture.child_agents_path()).unwrap();
  assert!(
    child_content.contains("Child instructions"),
    "nested child .opencode/AGENTS.md should contain child prompt content"
  );
}

#[test]
fn regression_isolated_opencode_skill_name_and_child_doc_extensions() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode categorized skill regression");

  let generated_skill_dir = fixture
    .project_skills_dir()
    .join("dev-tools-reverse-engineering");
  assert!(
    generated_skill_dir.join("SKILL.md").is_file(),
    "opencode should generate SKILL.md for dev-tools-reverse-engineering"
  );
  assert!(
    generated_skill_dir.join("packet-capture.md").is_file(),
    "opencode should emit packet-capture child doc as .md"
  );
  assert!(
    generated_skill_dir.join("reverse-tools.md").is_file(),
    "opencode should emit reverse-tools child doc as .md"
  );
  assert!(
    !generated_skill_dir.join("packet-capture.mdx").exists(),
    "opencode must not emit packet-capture child doc as .mdx"
  );
  assert!(
    !generated_skill_dir.join("reverse-tools.mdx").exists(),
    "opencode must not emit reverse-tools child doc as .mdx"
  );

  let skill_content = fs::read_to_string(generated_skill_dir.join("SKILL.md")).unwrap();
  assert!(
    skill_content.contains("name: dev-tools-reverse-engineering"),
    "opencode SKILL.md name field must match generated directory name"
  );
  assert!(
    skill_content.contains("skill: aindex/skills/dev-tools/reverse-engineering"),
    "opencode SKILL.md should keep the categorized source identifier"
  );

  fixture
    .clean()
    .assert_success("isolated tnmsc clean for opencode categorized skill regression");
  assert!(
    !fixture.project_opencode_dir().exists(),
    "clean should remove the generated .opencode tree"
  );
}

#[test]
fn local_opencode_project_skills_match_aindex_skills() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode skill checks");

  let expected_names = expected_installed_skill_names(&fixture.aindex_dir.join("skills"));
  let project_names: HashSet<String> = fs::read_dir(fixture.project_skills_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
    .map(|entry| entry.file_name().to_string_lossy().to_string())
    .collect();

  assert_eq!(
    project_names, expected_names,
    "project .opencode/skills should mirror installable aindex skill names"
  );
}

#[test]
fn local_opencode_commands_match_aindex_commands() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode command checks");

  let command_names = collect_file_names(&fixture.project_commands_dir(), ".md");
  assert!(
    command_names.contains("demo.md"),
    "opencode commands should include demo.md"
  );
  assert!(
    command_names.contains("qa-boot.md"),
    "opencode commands should include qa-boot.md"
  );
}

fn collect_rule_files(dir: &Path) -> Vec<std::path::PathBuf> {
  let mut files = Vec::new();
  if let Ok(entries) = fs::read_dir(dir) {
    for entry in entries.flatten() {
      let path = entry.path();
      if let Ok(file_type) = entry.file_type() {
        if file_type.is_file() {
          files.push(path);
        } else if file_type.is_dir() {
          files.extend(collect_rule_files(&path));
        }
      }
    }
  }
  files
}
