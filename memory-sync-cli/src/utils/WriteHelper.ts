import type {Buffer} from 'node:buffer'
import type {WriteResult} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as path from 'node:path'
import {FilePathKind} from '@/types'

/**
 * Logger interface for write operations
 */
export interface WriteLogger {
  trace: (data: object) => void
  error: (data: object) => void
}

/**
 * File system interface for write operations
 */
export interface WriteFs {
  existsSync: (p: string) => boolean
  mkdirSync: (p: string, options?: {recursive?: boolean}) => void
  writeFileSync: (p: string, data: string | Buffer, encoding?: BufferEncoding) => void
}

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
 * Centralizes the repetitive pattern found in all output plugins.
 */
export function createOutputPath(options: OutputPathOptions): RelativePath {
  const {relativePath, basePath, dirName} = options
  const absolutePath = path.join(basePath, relativePath)
  return {
    pathKind: FilePathKind.Relative,
    path: relativePath,
    basePath,
    getDirectoryName: () => dirName,
    getAbsolutePath: () => absolutePath
  }
}

/**
 * Options for writing a single file
 */
export interface WriteFileOptions {
  /** Full absolute path to write to */
  readonly fullPath: string
  /** Content to write */
  readonly content: string | Buffer
  /** Type label for logging */
  readonly type: string
  /** RelativePath for result */
  readonly relativePath: RelativePath
  /** Whether this is a dry run */
  readonly dryRun: boolean
  /** Logger instance */
  readonly logger: WriteLogger
  /** File system interface */
  readonly fs: WriteFs
}

/**
 * Ensure directory exists and write file.
 * Returns a WriteResult indicating success or failure.
 * Centralizes the repetitive try/catch pattern found in all output plugins.
 */
export function writeFileSafe(options: WriteFileOptions): WriteResult {
  const {fullPath, content, type, relativePath, dryRun, logger, fs} = options

  if (dryRun) {
    logger.trace({action: 'dryRun', type, path: fullPath})
    return {path: relativePath, success: true, skipped: false}
  }

  try {
    const parentDir = path.dirname(fullPath)
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, {recursive: true})
    fs.writeFileSync(fullPath, content, typeof content === 'string' ? 'utf8' : void 0)
    logger.trace({action: 'write', type, path: fullPath})
    return {path: relativePath, success: true}
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error({action: 'write', type, path: fullPath, error: errMsg})
    return {path: relativePath, success: false, error: error as Error}
  }
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
