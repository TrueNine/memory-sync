use std::fs;
use std::path::Path;

use crate::domain::plugin_shared::{FilePathKind, IDEKind, ProjectIDEConfigFile, RelativePath};
use crate::infra::script_runtime::proxy_public_path;

pub fn read_public_file(aindex_dir: &str, relative_path: &str) -> Option<String> {
  let proxied = proxy_public_path(relative_path);
  let path = Path::new(aindex_dir).join("public").join(&proxied);
  if !path.is_file() {
    return None;
  }
  fs::read_to_string(&path).ok()
}

pub fn read_public_ide_config_file(
  ide_type: IDEKind,
  relative_path: &str,
  aindex_dir: &str,
) -> Option<ProjectIDEConfigFile> {
  let proxied = proxy_public_path(relative_path);
  let content = read_public_file(aindex_dir, relative_path)?;
  let absolute_path = Path::new(aindex_dir)
    .join("public")
    .join(&proxied)
    .to_string_lossy()
    .into_owned();

  let length = content.len();

  Some(ProjectIDEConfigFile {
    ide_type,
    content,
    length,
    dir: RelativePath::new(&absolute_path, aindex_dir),
    file_path_kind: FilePathKind::Absolute,
  })
}
