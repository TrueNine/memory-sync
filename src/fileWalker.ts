import type { LogAdapter } from './log'
import path from 'node:path'
import fs from 'fs-extra'
import picomatch from 'picomatch'
import { linkOrCopyFile, pathExists } from './fs'

/**
 * Check if a file path matches any of the exclude patterns.
 * Supports glob-style patterns like:
 * - ref/star/dist - matches any dist directory under any subdirectory of ref/
 * - starstar/node_modules - matches node_modules at any depth
 * - star.log - matches files ending with .log
 *
 * @param filePath - The file path to check (relative to base directory)
 * @param excludePatterns - Array of glob patterns to match against
 * @returns true if the path matches any exclude pattern, false otherwise
 */
export function matchesExcludePattern(
  filePath: string,
  excludePatterns: readonly string[],
): boolean {
  if (excludePatterns.length === 0) {
    return false
  }

  // Normalize path separators to forward slashes for consistent matching
  const normalizedPath = filePath.replace(/\\/g, '/')

  for (const pattern of excludePatterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/')
    const isMatch = picomatch(normalizedPattern, { dot: true })

    // Check if the full path matches
    if (isMatch(normalizedPath)) {
      return true
    }

    // Check if any parent directory matches (for directory patterns)
    // This handles cases like `ref/*/dist` matching `ref/project/dist/file.js`
    const pathParts = normalizedPath.split('/')
    for (let i = 1; i <= pathParts.length; i++) {
      const partialPath = pathParts.slice(0, i).join('/')
      if (isMatch(partialPath)) {
        return true
      }
    }
  }

  return false
}

export interface FileWalkerOptions {
  /**
   * Base directory to start walking from
   */
  baseDir: string
  /**
   * File name to search for (e.g., 'AGENTS.md')
   */
  targetFileName?: string
  /**
   * File extension to search for (e.g., '.md')
   */
  targetExtension?: string
  /**
   * Directory names to skip (default: ['node_modules'])
   */
  skipDirs?: readonly string[]
  /**
   * Additional directory names to exclude from traversal
   * Alias for skipDirs for backward compatibility
   */
  excludeDirs?: readonly string[]
  /**
   * Glob patterns to exclude files and directories during traversal.
   * Supports patterns like:
   * - ref/star/dist - matches any dist directory under any subdirectory of ref/
   * - starstar/node_modules - matches node_modules at any depth
   * - star.log - matches files ending with .log
   */
  excludePatterns?: readonly string[]
  /**
   * Whether to skip hidden directories (except those in allowHiddenDirs)
   */
  skipHidden?: boolean
  /**
   * Hidden directories to allow (e.g., ['.scripts'])
   */
  allowHiddenDirs?: readonly string[]
  /**
   * Whether to skip symbolic links
   */
  skipSymlinks?: boolean
  /**
   * Whether to skip files in the root directory
   */
  skipRoot?: boolean
  /**
   * Whether to allow .scripts directory (adds to allowHiddenDirs)
   */
  allowScripts?: boolean
  /**
   * Custom filter function for files
   */
  fileFilter?: (filePath: string, fileName: string) => boolean
  /**
   * Custom filter function for directories
   */
  dirFilter?: (dirPath: string, dirName: string) => boolean
}

export interface FileInfo {
  path: string
  name: string
  size: number
  modified: Date
}

/**
 * Generic file walker that can find files based on various criteria
 */
export async function walkFiles(options: FileWalkerOptions): Promise<string[]> {
  const {
    baseDir,
    targetFileName,
    targetExtension,
    skipDirs = ['node_modules'],
    excludeDirs = [],
    excludePatterns = [],
    skipHidden = true,
    allowHiddenDirs = [],
    skipSymlinks = true,
    skipRoot = false,
    allowScripts = false,
    fileFilter,
    dirFilter,
  } = options

  // Merge skipDirs and excludeDirs
  const allSkipDirs = [...skipDirs, ...excludeDirs]

  // Merge allowHiddenDirs with allowScripts option
  const allAllowedHiddenDirs = allowScripts
    ? [...allowHiddenDirs, '.scripts']
    : allowHiddenDirs

  const foundFiles: string[] = []

  const walk = async (dir: string, isRootLevel: boolean = true): Promise<void> => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        // Calculate relative path for exclude pattern matching
        const relativePath = path.relative(baseDir, fullPath)

        // Skip symbolic links if requested
        if (skipSymlinks && entry.isSymbolicLink()) {
          continue
        }

        if (entry.isDirectory()) {
          // Skip hidden directories unless explicitly allowed
          if (skipHidden && entry.name.startsWith('.') && !allAllowedHiddenDirs.includes(entry.name)) {
            continue
          }

          // Skip directories in skipDirs list
          if (allSkipDirs.includes(entry.name)) {
            continue
          }

          // Skip directories matching exclude patterns
          if (excludePatterns.length > 0 && matchesExcludePattern(relativePath, excludePatterns)) {
            continue
          }

          // Apply custom directory filter if provided
          if (dirFilter && !dirFilter(fullPath, entry.name)) {
            continue
          }

          await walk(fullPath, false)
        } else if (entry.isFile()) {
          // Skip root files if requested
          if (skipRoot && isRootLevel) {
            continue
          }

          // Skip files matching exclude patterns
          if (excludePatterns.length > 0 && matchesExcludePattern(relativePath, excludePatterns)) {
            continue
          }

          let matches = true

          // Check target file name
          if (typeof targetFileName === 'string' && entry.name !== targetFileName) {
            matches = false
          }

          // Check target extension
          if (typeof targetExtension === 'string' && !entry.name.endsWith(targetExtension)) {
            matches = false
          }

          // Apply custom file filter if provided
          if (fileFilter && !fileFilter(fullPath, entry.name)) {
            matches = false
          }

          if (matches) {
            foundFiles.push(fullPath)
          }
        }
      }
    } catch {
      // Ignore read errors (permission denied, etc.)
    }
  }

  await walk(baseDir)
  return foundFiles.sort()
}

/**
 * Find all AGENTS.md files in a directory
 */
export async function findAgentsFiles(
  baseDir: string,
  options?: {
    skipRoot?: boolean
    allowScripts?: boolean
    excludeDirs?: string[]
    excludePatterns?: readonly string[]
  },
): Promise<string[]> {
  const { skipRoot = false, allowScripts = true, excludeDirs = [], excludePatterns = [] } = options ?? {}

  return walkFiles({
    baseDir,
    targetFileName: 'AGENTS.md',
    skipHidden: true,
    skipRoot,
    allowScripts,
    excludeDirs,
    excludePatterns,
    skipSymlinks: true,
  })
}

/**
 * Walk a directory and invoke callback for each file found
 * Useful for processing files without loading all paths into memory
 */
export async function walkDirectory(
  dirPath: string,
  callback: (filePath: string, fileName: string) => void | Promise<void>,
  options?: {
    skipHidden?: boolean
    skipSymlinks?: boolean
    excludeDirs?: string[]
  },
): Promise<void> {
  const {
    skipHidden = false,
    skipSymlinks = true,
    excludeDirs = ['node_modules'],
  } = options ?? {}

  const walk = async (dir: string): Promise<void> => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        // Skip symbolic links if requested
        if (skipSymlinks && entry.isSymbolicLink()) {
          continue
        }

        if (entry.isDirectory()) {
          // Skip hidden directories if requested
          if (skipHidden && entry.name.startsWith('.')) {
            continue
          }

          // Skip excluded directories
          if (excludeDirs.includes(entry.name)) {
            continue
          }

          await walk(fullPath)
        } else if (entry.isFile()) {
          await callback(fullPath, entry.name)
        }
      }
    } catch {
      // Ignore read errors (permission denied, etc.)
    }
  }

  await walk(dirPath)
}

/**
 * Find all files with specific extension
 */
export async function findFilesByExtension(
  baseDir: string,
  extension: string,
  options?: {
    skipHidden?: boolean
  },
): Promise<FileInfo[]> {
  const { skipHidden = true } = options ?? {}

  const filePaths = await walkFiles({
    baseDir,
    targetExtension: extension,
    skipHidden,
  })

  const fileInfos: FileInfo[] = []

  for (const filePath of filePaths) {
    try {
      const stats = await fs.stat(filePath)
      fileInfos.push({
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        modified: stats.mtime,
      })
    } catch {
      // Skip files that cannot be accessed
    }
  }

  return fileInfos
}

/**
 * Find files in _airef/star/dist/ directories matching criteria
 */
export async function findAirefDistFiles(
  baseDir: string,
  targetFileName: string,
): Promise<Map<string, string[]>> {
  const airefPath = path.join(baseDir, '_airef')
  const projectFiles = new Map<string, string[]>()

  try {
    const entries = await fs.readdir(airefPath, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const distPath = path.join(airefPath, entry.name, 'dist')

      if (!(await fs.pathExists(distPath))) {
        continue
      }

      const files = await walkFiles({
        baseDir: distPath,
        targetFileName,
        skipHidden: true,
        skipSymlinks: true,
      })

      if (files.length > 0) {
        projectFiles.set(entry.name, files)
      }
    }
  } catch {
    // _airef directory might not exist
  }

  return projectFiles
}



/**
 * Clean all CLAUDE.md files from target directories
 * Used during export to remove previous exports before writing new ones
 */
export async function cleanAllClaudeMd(baseDir: string): Promise<void> {
  // Find all CLAUDE.md files
  const claudeFiles = await walkFiles({
    baseDir,
    targetFileName: 'CLAUDE.md',
    skipHidden: true,
    skipSymlinks: true,
  })

  // Delete all found files
  await Promise.all(claudeFiles.map(async (file) => {
    try {
      await fs.remove(file)
    } catch {
      // Ignore deletion errors
    }
  }))
}

/**
 * Copy AGENTS.md files to CLAUDE.md in the same directory
 * Used during export to create CLAUDE.md versions of AGENTS.md files
 */
export async function copyAgentsToClaude(baseDir: string): Promise<void> {
  // Find all AGENTS.md files
  const agentsFiles = await findAgentsFiles(baseDir, {
    skipRoot: false,
    allowScripts: true,
  })

  // Copy each AGENTS.md to CLAUDE.md in the same directory
  await Promise.all(agentsFiles.map(async (agentsFile) => {
    const claudeFile = agentsFile.replace(/AGENTS\.md$/, 'CLAUDE.md')
    try {
      await fs.copy(agentsFile, claudeFile, { overwrite: true })
    } catch {
      // Ignore copy errors
    }
  }))
}