import * as fs from 'node:fs'
import * as path from 'node:path'

function normalizeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).toLowerCase()
}

export function isDirectoryStructureMismatchError(error: unknown): boolean {
  const normalizedError = normalizeErrorMessage(error)
  return normalizedError.includes('enotdir')
    || normalizedError.includes('not a directory')
    || normalizedError.includes('eexist')
    || normalizedError.includes('file exists')
}

export function findBlockingNonDirectoryPath(expectedDirPath: string): string | undefined {
  const resolvedDirPath = path.resolve(expectedDirPath)
  const {root} = path.parse(resolvedDirPath)
  const relativeSegments = resolvedDirPath
    .slice(root.length)
    .split(path.sep)
    .filter(segment => segment.length > 0)

  let currentPath = root
  for (const segment of relativeSegments) {
    currentPath = currentPath.length > 0 ? path.join(currentPath, segment) : segment
    if (!fs.existsSync(currentPath)) continue

    try {
      if (!fs.lstatSync(currentPath).isDirectory()) return currentPath
    }
    catch {
      return void 0
    }
  }

  return void 0
}

export function resolveBlockingFilePath(options: {
  readonly path: string
  readonly targetKind: 'file' | 'directory'
  readonly error: unknown
}): string | undefined {
  if (!isDirectoryStructureMismatchError(options.error)) return void 0

  const expectedDirPath = options.targetKind === 'file'
    ? path.dirname(options.path)
    : options.path

  return findBlockingNonDirectoryPath(expectedDirPath)
}

export function removeBlockingFile(blockingPath: string): {removed: boolean, error?: unknown} {
  if (!fs.existsSync(blockingPath)) return {removed: false}

  try {
    if (fs.lstatSync(blockingPath).isDirectory()) return {removed: false}
    fs.rmSync(blockingPath, {force: true})
    return {removed: true}
  }
  catch (error) {
    return {removed: false, error}
  }
}
