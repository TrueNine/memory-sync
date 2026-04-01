import type * as fs from 'node:fs'
import {resolveAbsolutePath} from '../ProtectedDeletionGuard'

const EMPTY_DIRECTORY_SCAN_EXCLUDED_BASENAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'target',
  '.next',
  '.turbo',
  'coverage',
  '.nyc_output',
  '.cache',
  '.vite',
  '.vite-temp',
  '.pnpm-store',
  '.yarn',
  '.idea',
  '.volumes',
  'volumes'
])

export interface WorkspaceEmptyDirectoryPlan {
  readonly emptyDirsToDelete: string[]
}

export interface WorkspaceEmptyDirectoryPlannerOptions {
  readonly fs: typeof import('node:fs')
  readonly path: typeof import('node:path')
  readonly workspaceDir: string
  readonly filesToDelete: readonly string[]
  readonly dirsToDelete: readonly string[]
}

function shouldSkipEmptyDirectoryTree(
  nodePath: typeof import('node:path'),
  workspaceDir: string,
  currentDir: string
): boolean {
  if (currentDir === workspaceDir) return false
  return EMPTY_DIRECTORY_SCAN_EXCLUDED_BASENAMES.has(
    nodePath.basename(currentDir)
  )
}

export function planWorkspaceEmptyDirectoryCleanup(
  options: WorkspaceEmptyDirectoryPlannerOptions
): WorkspaceEmptyDirectoryPlan {
  const workspaceDir = resolveAbsolutePath(options.workspaceDir)
  const filesToDelete = new Set(options.filesToDelete.map(resolveAbsolutePath))
  const dirsToDelete = new Set(options.dirsToDelete.map(resolveAbsolutePath))
  const emptyDirsToDelete = new Set<string>()

  // Track which directories are scheduled for deletion (dirsToDelete + emptyDirsToDelete)
  const isScheduledForDeletion = (dirPath: string): boolean => dirsToDelete.has(dirPath) || emptyDirsToDelete.has(dirPath)

  const collectEmptyDirectories = (currentDir: string): boolean => {
    if (isScheduledForDeletion(currentDir)) return true
    if (shouldSkipEmptyDirectoryTree(options.path, workspaceDir, currentDir))
    { return false }

    let entries: fs.Dirent[]
    try {
      entries = options.fs.readdirSync(currentDir, {withFileTypes: true})
    } catch {
      return false
    }

    let hasRetainedEntries = false

    for (const entry of entries) {
      const entryPath = resolveAbsolutePath(
        options.path.join(currentDir, entry.name)
      )

      if (isScheduledForDeletion(entryPath)) continue

      if (entry.isDirectory()) {
        if (
          shouldSkipEmptyDirectoryTree(options.path, workspaceDir, entryPath)
        ) {
          hasRetainedEntries = true
          continue
        }

        if (collectEmptyDirectories(entryPath)) {
          emptyDirsToDelete.add(entryPath)
          continue
        }

        hasRetainedEntries = true
        continue
      }

      if (filesToDelete.has(entryPath)) continue
      hasRetainedEntries = true
    }

    return !hasRetainedEntries
  }

  // Iteratively collect empty directories until no new ones are found
  // This handles the case where deleting a child directory makes its parent empty
  let previousSize = -1
  while (emptyDirsToDelete.size !== previousSize) {
    previousSize = emptyDirsToDelete.size
    collectEmptyDirectories(workspaceDir)
  }

  return {
    emptyDirsToDelete: [...emptyDirsToDelete].sort((a, b) =>
      a.localeCompare(b))
  }
}
