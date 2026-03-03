/**
 * Aindex validation and generation utilities
 * 使用扁平的 bundles 结构直接遍历创建项目目录和文件
 */
import type {ILogger} from './plugins/plugin-shared'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Version control check result
 */
export interface VersionControlCheckResult {
  readonly hasGit: boolean
  readonly gitPath: string
}

/**
 * Check if the aindex has version control (.git directory)
 * Logs info if .git exists, warns if not
 *
 * @param rootPath - Root path of the aindex
 * @param logger - Optional logger instance
 * @returns Version control check result
 */
export function checkVersionControl(
  rootPath: string,
  logger?: ILogger
): VersionControlCheckResult {
  const gitPath = path.join(rootPath, '.git')
  const hasGit = fs.existsSync(gitPath)

  if (hasGit) logger?.info('version control detected', {path: gitPath})
  else logger?.warn('no version control detected, please use git to manage your aindex', {path: rootPath})

  return {hasGit, gitPath}
}

/**
 * Generation result
 */
export interface GenerationResult {
  readonly success: boolean
  readonly rootPath: string
  readonly createdDirs: readonly string[]
  readonly createdFiles: readonly string[]
  readonly existedDirs: readonly string[]
  readonly existedFiles: readonly string[]
}

/**
 * Generation options
 */
export interface GenerationOptions {
  /** Logger instance */
  readonly logger?: ILogger
}

/**
 * Generate aindex directory structure
 */
export function generateAindex(
  rootPath: string,
  options: GenerationOptions = {}
): GenerationResult {
  const {logger} = options
  const createdDirs: string[] = []
  const createdFiles: string[] = []
  const existedDirs: string[] = []
  const existedFiles: string[] = []
  const createdDirsSet = new Set<string>()

  if (fs.existsSync(rootPath)) {
    existedDirs.push(rootPath)
    logger?.debug('directory exists', {path: rootPath})
  } else {
    fs.mkdirSync(rootPath, {recursive: true})
    createdDirs.push(rootPath)
    createdDirsSet.add(rootPath)
    logger?.info('created directory', {path: rootPath})
  }

  return {
    success: true,
    rootPath,
    createdDirs,
    createdFiles,
    existedDirs,
    existedFiles
  }
}
