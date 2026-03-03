import * as path from 'node:path'

export {
  type SafeWriteOptions,
  type SafeWriteResult,
  writeFileSafe,
  type WriteLogger
} from '../plugins/desk-paths' // Re-export from desk-paths

/**
 * Options for creating a relative path for output files
 */
export interface OutputPathOptions {
  /** Relative path from basePath */
  readonly relativePath: string
  /** Base directory for absolute path resolution */
  readonly basePath: string
  /** Directory name */
  readonly dirName: string
}

/**
 * Create a relative path string for output file registration.
 * Simply joins basePath with relativePath.
 */
export function createOutputPath(options: OutputPathOptions): string {
  const {relativePath, basePath} = options
  return path.join(basePath, relativePath)
}

/**
 * Create a skill directory path
 */
export function createSkillDirPath(basePath: string, skillsSubDir: string, skillName: string): string {
  return path.join(basePath, skillsSubDir, skillName)
}

/**
 * Create a command output path
 */
export function createCommandOutputPath(
  globalDir: string,
  commandsSubDir: string,
  fileName: string
): {relativePath: string, fullPath: string} {
  const fullPath = path.join(globalDir, commandsSubDir, fileName)
  return {
    fullPath,
    relativePath: path.join(commandsSubDir, fileName)
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
): {relativePath: string, fullPath: string} {
  const skillPath = path.join(skillsSubDir, skillName, fileName)
  const fullPath = path.join(globalDir, skillPath)
  return {
    fullPath,
    relativePath: skillPath
  }
}
