pub mod claude_code_output_plan;
pub mod codex_output_plan;
pub mod cursor_output_plan;
pub mod droid_output_plan;
pub mod gemini_output_plan;
pub mod generic_skills_output_plan;
pub mod jetbrains_ai_assistant_codex_output_plan;
pub mod kiro_output_plan;
pub mod opencode_output_plan;
pub mod qoder_output_plan;
pub mod shared;
pub mod trae_output_plan;
pub mod warp_output_plan;
pub mod windsurf_output_plan;

#[cfg(test)]
mod regression_tests {
  use std::fs;
  use std::path::Path;

  use crate::domain::output_context::OutputContext;
  use crate::domain::plugin_shared::{
    FilePathKind, GlobalMemoryPrompt, Project, ProjectChildrenMemoryPrompt,
    ProjectRootMemoryPrompt, PromptKind, RelativePath, RootPath, Workspace,
  };

  #[test]
  fn resolve_effective_home_dir_is_not_redefined_in_each_output_plan() {
    // 修复 #378：把 5 份重复的 `resolve_effective_home_dir()` 收口到公共 helper，
    // 这里用回归测试锁住 output plan 里不再各自定义它。
    let output_plans_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/domain/output_plans");
    let duplicate_definitions = [
      "claude_code_output_plan.rs",
      "codex_output_plan.rs",
      "gemini_output_plan.rs",
      "opencode_output_plan.rs",
      "droid_output_plan.rs",
    ]
    .iter()
    .filter(|file_name| {
      fs::read_to_string(output_plans_dir.join(file_name))
        .expect("output plan source should be readable")
        .contains("fn resolve_effective_home_dir()")
    })
    .count();

    assert_eq!(
      duplicate_definitions, 0,
      "resolve_effective_home_dir should be defined only once outside the output plan files"
    );
  }

  fn create_root_prompt(content: &str) -> ProjectRootMemoryPrompt {
    ProjectRootMemoryPrompt {
      prompt_type: PromptKind::ProjectRootMemory,
      content: content.to_string(),
      length: content.len(),
      file_path_kind: FilePathKind::Root,
      dir: RootPath::new(""),
      yaml_front_matter: None,
      raw_front_matter: None,
      markdown_ast: None,
      markdown_contents: None,
    }
  }

  fn create_child_prompt(
    project_root: &str,
    relative_dir: &str,
    content: &str,
  ) -> ProjectChildrenMemoryPrompt {
    let relative_path = RelativePath::new(relative_dir, project_root);
    ProjectChildrenMemoryPrompt {
      prompt_type: PromptKind::ProjectChildrenMemory,
      content: content.to_string(),
      length: content.len(),
      file_path_kind: FilePathKind::Relative,
      dir: relative_path.clone(),
      yaml_front_matter: None,
      raw_front_matter: None,
      markdown_ast: None,
      markdown_contents: None,
      working_child_directory_path: relative_path,
    }
  }

  fn create_global_memory(content: &str) -> GlobalMemoryPrompt {
    GlobalMemoryPrompt {
      prompt_type: PromptKind::GlobalMemory,
      content: content.to_string(),
      length: content.len(),
      file_path_kind: FilePathKind::Relative,
      dir: RelativePath::new(".global", "/home/test"),
      raw_front_matter: None,
      markdown_contents: None,
      parent_directory_path: None,
      raw_content: None,
    }
  }

  fn create_project(workspace_root: &str, name: &str) -> Project {
    Project {
      name: Some(name.to_string()),
      dir_from_workspace_path: Some(RelativePath::new(name, workspace_root)),
      ..Project::default()
    }
  }

  fn sample_context_with_child_prompts(workspace_root: &str) -> OutputContext {
    let project_root = format!("{workspace_root}/project-a");
    OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new(workspace_root),
        projects: vec![
          Project {
            name: Some("__workspace__".to_string()),
            is_workspace_root_project: Some(true),
            root_memory_prompt: Some(create_root_prompt("workspace root")),
            ..Project::default()
          },
          Project {
            is_prompt_source_project: Some(true),
            root_memory_prompt: Some(create_root_prompt("prompt source root")),
            ..create_project(workspace_root, "aindex")
          },
          Project {
            root_memory_prompt: Some(create_root_prompt("project root")),
            child_memory_prompts: Some(vec![create_child_prompt(
              &project_root,
              "packages/api",
              "child memory",
            )]),
            ..create_project(workspace_root, "project-a")
          },
        ],
      }),
      global_memory: Some(create_global_memory("global memory")),
      ..OutputContext::default()
    }
  }

  #[test]
  fn regression_380_child_memory_prompts_are_emitted_for_all_target_plans() {
    // Fixes #380: every listed output plan must emit child memory files instead of
    // silently dropping project.child_memory_prompts.
    let workspace_root = "/workspace";
    let child_dir = format!("{workspace_root}/project-a/packages/api");
    let context = sample_context_with_child_prompts(workspace_root);

    let cursor_plan =
      crate::domain::output_plans::cursor_output_plan::build_cursor_output_plan(&context).unwrap();
    assert!(
      cursor_plan.output_files.iter().any(
        |file| file.path == format!("{child_dir}/.cursorrules") && file.content == "child memory"
      ),
      "cursor output plan must emit child .cursorrules files"
    );

    let windsurf_plan =
      crate::domain::output_plans::windsurf_output_plan::build_windsurf_output_plan(&context)
        .unwrap();
    assert!(
      windsurf_plan
        .output_files
        .iter()
        .any(|file| file.path == format!("{child_dir}/.windsurfrules")
          && file.content == "child memory"),
      "windsurf output plan must emit child .windsurfrules files"
    );

    let trae_plan =
      crate::domain::output_plans::trae_output_plan::build_trae_output_plan(&context).unwrap();
    assert!(
      trae_plan.output_files.iter().any(|file| {
        file.path == format!("{child_dir}/.trae/steering/GLOBAL.md")
          && file.content == "child memory"
      }),
      "trae output plan must emit child steering files"
    );

    let opencode_plan =
      crate::domain::output_plans::opencode_output_plan::build_opencode_output_plan(&context)
        .unwrap();
    assert!(
      opencode_plan.output_files.iter().any(|file| {
        file.path == format!("{child_dir}/.opencode/AGENTS.md") && file.content == "child memory"
      }),
      "opencode output plan must emit child AGENTS files"
    );

    let codex_plan =
      crate::domain::output_plans::codex_output_plan::build_codex_output_plan(&context).unwrap();
    assert!(
      codex_plan
        .output_files
        .iter()
        .any(|file| file.path == format!("{child_dir}/AGENTS.md") && file.content == "child memory"),
      "codex output plan must emit child AGENTS files"
    );
  }

  #[test]
  fn regression_389_global_memory_stays_in_global_tool_files() {
    // Fixes #379 historical note: that issue incorrectly attributed global
    // memory to project files while AgentsOutputAdaptor is active.
    // Fixes #389: global memory belongs only in tool-global prompt files.
    let workspace_root = "/workspace";
    let project_root = format!("{workspace_root}/project-a");
    let context = OutputContext {
      registered_output_plugins: Some(vec!["AgentsOutputAdaptor".to_string()]),
      ..sample_context_with_child_prompts(workspace_root)
    };

    let claude_plan =
      crate::domain::output_plans::claude_code_output_plan::build_claude_code_output_plan(&context)
        .unwrap();
    assert!(
      claude_plan
        .output_files
        .iter()
        .any(|file| file.path == format!("{project_root}/CLAUDE.md")
          && file.content == "project root"),
      "claude project CLAUDE.md must keep project memory when AgentsOutputAdaptor is active"
    );
    assert!(
      claude_plan
        .output_files
        .iter()
        .any(|file| file.path.ends_with("/.claude/CLAUDE.md")
          && file.scope.as_deref() == Some("global")
          && file.content == "global memory"),
      "claude global CLAUDE.md must receive global memory"
    );
    assert!(
      !claude_plan
        .output_files
        .iter()
        .any(|file| file.path == format!("{project_root}/CLAUDE.md")
          && file.content.contains("global memory")),
      "claude project CLAUDE.md must not receive global memory"
    );

    let opencode_plan =
      crate::domain::output_plans::opencode_output_plan::build_opencode_output_plan(&context)
        .unwrap();
    assert!(
      opencode_plan.output_files.iter().any(|file| {
        file.path == format!("{project_root}/.opencode/AGENTS.md")
          && file.content == "project root"
      }),
      "opencode project AGENTS.md must keep project memory when AgentsOutputAdaptor is active"
    );
    assert!(
      opencode_plan.output_files.iter().any(|file| {
        file.path.ends_with("/.config/opencode/AGENTS.md")
          && file.scope.as_deref() == Some("global")
          && file.content == "global memory"
      }),
      "opencode global AGENTS.md must receive global memory"
    );
    assert!(
      !opencode_plan.output_files.iter().any(|file| {
        file.path == format!("{project_root}/.opencode/AGENTS.md")
          && file.content.contains("global memory")
      }),
      "opencode project AGENTS.md must not receive global memory"
    );

    let codex_plan =
      crate::domain::output_plans::codex_output_plan::build_codex_output_plan(&context).unwrap();
    assert!(
      codex_plan
        .output_files
        .iter()
        .any(|file| file.path == format!("{project_root}/AGENTS.md")
          && file.content == "project root"),
      "codex project AGENTS.md must keep project memory when AgentsOutputAdaptor is active"
    );
    assert!(
      codex_plan
        .output_files
        .iter()
        .any(|file| file.path.ends_with("/.codex/AGENTS.md")
          && file.scope.as_deref() == Some("global")
          && file.content == "global memory"),
      "codex global AGENTS.md must receive global memory"
    );
    assert!(
      !codex_plan
        .output_files
        .iter()
        .any(|file| file.path == format!("{project_root}/AGENTS.md")
          && file.content.contains("global memory")),
      "codex project AGENTS.md must not receive global memory"
    );
  }
}
