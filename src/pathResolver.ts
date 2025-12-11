import path from 'node:path'

type PathModule = Pick<typeof path.posix, 'relative' | 'dirname' | 'isAbsolute'>

function isWindowsLikePath(input: string): boolean {
  return /^[a-z]:[\\/]/i.test(input) || input.startsWith('\\\\')
}

function getPathModule(sourcePath: string, basePath: string): PathModule {
  if (isWindowsLikePath(sourcePath) || isWindowsLikePath(basePath)) {
    return path.win32
  }
  return path.posix
}

export interface PathCalculationOptions {
  sourcePath: string
  basePath: string
}

/**
 * Calculate relative path from base path to source path
 */
export function calculateRelativePath(options: PathCalculationOptions): string {
  const pathModule = getPathModule(options.sourcePath, options.basePath)
  return pathModule.relative(options.basePath, options.sourcePath)
}

function normalizeDirPath(dirPath: string): string {
  return dirPath.replace(/\\/g, '/')
}

/**
 * Calculate glob pattern for file matching
 * Root files return "**", nested files return "dir/**"
 */
export function calculateGlobPattern(options: PathCalculationOptions): string {
  const { pathModule, relativePath } = resolveRelativePath(options)
  const dirPath = pathModule.dirname(relativePath)
  if (dirPath === '.' || dirPath === '') {
    return '**/*'
  }
  return `${normalizeDirPath(dirPath)}/**/*`
}

/**
 * Generate unique filename for nested files
 * e.g., src/api/AGENTS.md -> _src_api.md
 */
export function generateUniqueFileName(options: PathCalculationOptions): string {
  const { pathModule, relativePath } = resolveRelativePath(options)
  const dirPath = pathModule.dirname(relativePath)

  if (dirPath === '.' || dirPath === '') {
    return '_project.md'
  }

  return `_${normalizeDirPath(dirPath).replace(/\//g, '_').replace(/\./g, '___')}.md`
}

/**
 * Check if a file path is inside a directory
 */
export function isInsideDirectory(filePath: string, directoryPath: string): boolean {
  const pathModule = getPathModule(filePath, directoryPath)
  const relativePath = pathModule.relative(directoryPath, filePath)
  if (!relativePath) {
    return false
  }
  return !relativePath.startsWith('..') && !pathModule.isAbsolute(relativePath)
}

export interface RefFileNameOptions {
  projectName: string
  relativePath: string
}

/**
 * Generate ref project filename with proper prefix
 * e.g., { projectName: 'TrueNine', relativePath: 'dist/gradle' } -> _ref_TrueNine_dist_gradle.md
 */
export function generateRefFileName(options: RefFileNameOptions): string {
  const { projectName, relativePath } = options
  const normalizedPath = relativePath.replace(/[\\/]/g, '_').replace(/\./g, '___')
  return `_ref_${projectName}_${normalizedPath}.md`
}