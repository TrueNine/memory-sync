import type {FilePathKind} from '@/types/Enums'

/**
 * Common directory representation
 */
export interface Path<K extends FilePathKind = FilePathKind> {
  readonly pathKind: K
  readonly path: string
  readonly getDirectoryName: () => string
}

/**
 * Relative path directory
 */
export interface RelativePath extends Path<FilePathKind.Relative> {
  readonly basePath: string
  getAbsolutePath: () => string
}

/**
 * Absolute path directory
 */
export type AbsolutePath = Path<FilePathKind.Absolute>

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
