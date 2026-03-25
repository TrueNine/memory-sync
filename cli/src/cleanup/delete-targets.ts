import * as path from 'node:path'
import {resolveAbsolutePath} from '../ProtectedDeletionGuard'

export interface CompactedDeletionTargets {
  readonly files: string[]
  readonly dirs: string[]
}

function stripTrailingSeparator(rawPath: string): string {
  const {root} = path.parse(rawPath)
  if (rawPath === root) return rawPath
  return rawPath.endsWith(path.sep) ? rawPath.slice(0, -1) : rawPath
}

export function isSameOrChildDeletionPath(candidate: string, parent: string): boolean {
  const normalizedCandidate = stripTrailingSeparator(candidate)
  const normalizedParent = stripTrailingSeparator(parent)
  if (normalizedCandidate === normalizedParent) return true
  return normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`)
}

export function compactDeletionTargets(
  files: readonly string[],
  dirs: readonly string[]
): CompactedDeletionTargets {
  const filesByKey = new Map<string, string>()
  const dirsByKey = new Map<string, string>()

  for (const filePath of files) {
    const resolvedPath = resolveAbsolutePath(filePath)
    filesByKey.set(resolvedPath, resolvedPath)
  }

  for (const dirPath of dirs) {
    const resolvedPath = resolveAbsolutePath(dirPath)
    dirsByKey.set(resolvedPath, resolvedPath)
  }

  const compactedDirs = new Map<string, string>()
  const sortedDirEntries = [...dirsByKey.entries()].sort((a, b) => a[0].length - b[0].length)

  for (const [dirKey, dirPath] of sortedDirEntries) {
    let coveredByParent = false
    for (const existingParentKey of compactedDirs.keys()) {
      if (isSameOrChildDeletionPath(dirKey, existingParentKey)) {
        coveredByParent = true
        break
      }
    }

    if (!coveredByParent) compactedDirs.set(dirKey, dirPath)
  }

  const compactedFiles: string[] = []
  for (const [fileKey, filePath] of filesByKey) {
    let coveredByDir = false
    for (const dirKey of compactedDirs.keys()) {
      if (isSameOrChildDeletionPath(fileKey, dirKey)) {
        coveredByDir = true
        break
      }
    }

    if (!coveredByDir) compactedFiles.push(filePath)
  }

  compactedFiles.sort((a, b) => a.localeCompare(b))
  const compactedDirPaths = [...compactedDirs.values()].sort((a, b) => a.localeCompare(b))

  return {files: compactedFiles, dirs: compactedDirPaths}
}
