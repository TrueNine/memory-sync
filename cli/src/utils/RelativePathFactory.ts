import type {RelativePath} from '@truenine/plugin-shared'
import * as path from 'node:path'
import {FilePathKind} from '@truenine/plugin-shared'

/**
 * Options for creating a RelativePath
 */
export interface CreateRelativePathOptions {
  /** The relative path string */
  readonly pathStr: string
  /** The base path for resolving absolute paths */
  readonly basePath: string
}

export function createRelativePath(options: CreateRelativePathOptions): RelativePath {
  const {pathStr, basePath} = options
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => path.dirname(pathStr),
    getAbsolutePath: () => path.resolve(basePath, pathStr)
  }
}

/**
 * Options for creating a RelativePath with a custom directory name
 */
export interface CreateRelativePathWithDirNameOptions extends CreateRelativePathOptions {
  /** Custom directory name to return from getDirectoryName */
  readonly dirName: string
}

/**
 * Create a RelativePath with a custom getDirectoryName implementation.
 * Useful when the directory name should be different from path.dirname(pathStr).
 *
 * @param options - Configuration including custom directory name
 * @returns A RelativePath with custom getDirectoryName
 */
export function createRelativePathWithDirName(options: CreateRelativePathWithDirNameOptions): RelativePath {
  const {pathStr, basePath, dirName} = options
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => dirName,
    getAbsolutePath: () => path.resolve(basePath, pathStr)
  }
}

/**
 * Create a RelativePath for a file within a directory.
 * The getDirectoryName returns the parent directory's name.
 *
 * @param dir - Parent directory RelativePath
 * @param fileName - Name of the file
 * @returns A RelativePath pointing to the file
 */
export function createFileRelativePath(dir: RelativePath, fileName: string): RelativePath {
  const filePath = path.join(dir.path, fileName)
  return {
    pathKind: FilePathKind.Relative,
    path: filePath,
    basePath: dir.basePath,
    getDirectoryName: () => dir.getDirectoryName(),
    getAbsolutePath: () => path.join(dir.getAbsolutePath(), fileName)
  }
}

/**
 * Create a RelativePath for a subdirectory.
 *
 * @param parent - Parent directory RelativePath
 * @param subDirName - Name of the subdirectory
 * @returns A RelativePath pointing to the subdirectory
 */
export function createSubdirRelativePath(parent: RelativePath, subDirName: string): RelativePath {
  const subPath = path.join(parent.path, subDirName)
  return {
    pathKind: FilePathKind.Relative,
    path: subPath,
    basePath: parent.basePath,
    getDirectoryName: () => subDirName,
    getAbsolutePath: () => path.join(parent.getAbsolutePath(), subDirName)
  }
}
