import type { FilePathKind } from '@/types/Enums'

/**
 * 通用目录表示
 */
export interface Path<K extends FilePathKind = FilePathKind> {
  readonly pathKind: K
  readonly path: string
  readonly getDirectoryName: () => string
}

/**
 * 相对路径目录
 */
export interface RelativePath extends Path<FilePathKind.Relative> {
  /**
   * 相对路径的基准目录，使用 `/` 进行分割
   */
  readonly basePath: string
  getAbsolutePath: () => string
}

/**
 * 绝对路径目录
 */
export type AbsolutePath = Path<FilePathKind.Absolute>

export type EmptyPath = Path<FilePathKind.Empty>

export interface FileContent<
  C = unknown,
  FK extends FilePathKind = FilePathKind.Relative,
  F extends Path = RelativePath,
> {
  content: C
  length: number
  filePathKind: FK
  dir: F
  charsetEncoding?: BufferEncoding
}
