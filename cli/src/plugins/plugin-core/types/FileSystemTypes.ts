import type {FilePathKind} from './enums'

/**
 * Common directory representation
 * @deprecated 使用 TypedPath 替代
 */
export interface Path<K extends FilePathKind = FilePathKind> {
  readonly pathKind: K
  readonly path: string
  readonly getDirectoryName: () => string
}

/**
 * Relative path directory
 * @deprecated 使用 WorkspacePath 或 ProjectPath 替代
 */
export interface RelativePath extends Path<FilePathKind.Relative> {
  readonly basePath: string
  getAbsolutePath: () => string
}

/**
 * Absolute path directory
 * @deprecated 使用具体路径类型替代 (HomedirPath, WorkspacePath, AindexPath 等)
 */
export type AbsolutePath = Path<FilePathKind.Absolute>

/**
 * @deprecated 使用 WorkspacePath 替代
 */
export type RootPath = Path<FilePathKind.Root>

export interface FileContent<
  C = unknown,
  FK extends FilePathKind = FilePathKind.Relative,
  F extends Path = RelativePath
> {
  content: C
  length: number
  filePathKind: FK
  dir: F
  charsetEncoding?: BufferEncoding
}
