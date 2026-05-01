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
}
