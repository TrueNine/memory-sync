use std::path::PathBuf;

use crate::domain::config;

/// 修复 #378：将各 output plan 重复的有效 home 目录解析统一到这里。
pub(crate) fn resolve_effective_home_dir() -> PathBuf {
  let runtime_environment = config::resolve_runtime_environment();
  runtime_environment
    .effective_home_dir
    .or(runtime_environment.native_home_dir)
    .unwrap_or_else(|| PathBuf::from("/"))
}
