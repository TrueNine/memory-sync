use std::fs;
use std::io;
use std::path::Path;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum InfraError {
  #[error("IO error: {0}")]
  Io(#[from] io::Error),
}

pub type InfraResult<T> = Result<T, InfraError>;

pub fn write_file_sync<P: AsRef<Path>>(path: P, content: &[u8]) -> InfraResult<()> {
  if let Some(parent) = path.as_ref().parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(path, content).map_err(InfraError::from)
}

pub fn read_file_sync<P: AsRef<Path>>(path: P) -> InfraResult<String> {
  fs::read_to_string(&path).map_err(|err| {
    InfraError::Io(io::Error::new(
      err.kind(),
      format!(
        "Failed to read file \"{}\": {}",
        path.as_ref().display(),
        err
      ),
    ))
  })
}

pub fn ensure_dir<P: AsRef<Path>>(dir: P) -> InfraResult<()> {
  fs::create_dir_all(dir).map_err(InfraError::from)
}

pub fn exists_sync<P: AsRef<Path>>(path: P) -> bool {
  path.as_ref().exists()
}

pub fn delete_path_sync<P: AsRef<Path>>(path: P) -> io::Result<()> {
  let path = path.as_ref();
  let metadata = match fs::symlink_metadata(path) {
    Ok(metadata) => metadata,
    Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(()),
    Err(err) => return Err(err),
  };

  if metadata.file_type().is_symlink() {
    #[cfg(windows)]
    {
      let is_directory = fs::metadata(path)
        .map(|resolved| resolved.is_dir())
        .unwrap_or(false);
      return if is_directory {
        fs::remove_dir(path).or_else(|_| fs::remove_file(path))
      } else {
        fs::remove_file(path).or_else(|_| fs::remove_dir(path))
      };
    }
    #[cfg(not(windows))]
    {
      return fs::remove_file(path);
    }
  }

  if metadata.is_dir() {
    match fs::remove_dir_all(path) {
      Ok(()) => Ok(()),
      Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(()),
      Err(err) => Err(err),
    }
  } else {
    match fs::remove_file(path) {
      Ok(()) => Ok(()),
      Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(()),
      Err(err) => Err(err),
    }
  }
}
