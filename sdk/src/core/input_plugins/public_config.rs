use std::fs;
use std::path::Path;

use crate::core::plugin_shared::{FilePathKind, IDEKind, ProjectIDEConfigFile, RelativePath};

pub fn read_public_file(aindex_dir: &str, relative_path: &str) -> Option<String> {
  let path = Path::new(aindex_dir).join("public").join(relative_path);
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
  let content = read_public_file(aindex_dir, relative_path)?;
  let absolute_path = Path::new(aindex_dir)
    .join("public")
    .join(relative_path)
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
