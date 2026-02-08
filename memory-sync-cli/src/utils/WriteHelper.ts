import type { RelativePath } from '@/types/FileSystemTypes'
import { createRelativePath } from '@truenine/desk-paths'
import * as path from 'node:path'

// Re-export from desk-paths
export { writeFileSafe, type SafeWriteOptions, type SafeWriteResult, type WriteLogger } from '@truenine/desk-paths'

/**
 * Options for creating a RelativePath for output files
 */
export interface OutputPathOptions {
  /** Relative path from basePath */
  readonly relativePath: string
  /** Base directory for absolute path resolution */
  readonly basePath: string
  /** Directory name to return from getDirectoryName() */
  readonly dirName: string
}

/**
 * Create a RelativePath object for output file registration.
 * Delegates to desk-paths createRelativePath.
 */
export function createOutputPath(options: OutputPathOptions): RelativePath {
  const {relativePath, basePath, dirName} = options
  return createRelativePath(relativePath, basePath, () => dirName)
}

/**
 * Create a skill directory path
 */
export function createSkillDirPath(basePath: string, skillsSubDir: string, skillName: string): string {
  return path.join(basePath, skillsSubDir, skillName)
}

/**
 * Create a fast command output path
 */
export function createFastCommandOutputPath(
  globalDir: string,
  commandsSubDir: string,
  fileName: string
): {relativePath: RelativePath, fullPath: string} {
  const fullPath = path.join(globalDir, commandsSubDir, fileName)
  return {
    fullPath,
    relativePath: createOutputPath({
      relativePath: path.join(commandsSubDir, fileName),
      basePath: globalDir,
      dirName: commandsSubDir
    })
  }
}

/**
 * Create a skill file output path
 */
export function createSkillOutputPath(
  globalDir: string,
  skillsSubDir: string,
  skillName: string,
  fileName: string
): {relativePath: RelativePath, fullPath: string} {
  const skillPath = path.join(skillsSubDir, skillName, fileName)
  const fullPath = path.join(globalDir, skillPath)
  return {
    fullPath,
    relativePath: createOutputPath({
      relativePath: skillPath,
      basePath: globalDir,
      dirName: skillName
    })
  }
}
