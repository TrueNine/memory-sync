/**
 * Shadow Source Project validation and generation utilities
 * 使用扁平的 bundles 结构直接遍历创建项目目录和文件
 */
import type {ILogger} from '@/log'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {bundles} from '@truenine/init-bundle'

/**
 * Version control check result
 */
export interface VersionControlCheckResult {
  readonly hasGit: boolean
  readonly gitPath: string
}

/**
 * Check if the shadow source project has version control (.git directory)
 * Logs info if .git exists, warns if not
 *
 * @param rootPath - Root path of the shadow source project
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
  else logger?.warn('no version control detected, please use git to manage your shadow source project', {path: rootPath})

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
  /** Source directory to copy config files from (if exists) */
  readonly sourceDir?: string
  /** Logger instance */
  readonly logger?: ILogger
}

/**
 * Helper to read file from source or return default content
 */
function getFileContent(
  filePath: string,
  basePath: string,
  sourceDir: string | undefined,
  defaultContent: string,
  logger?: ILogger
): string {
  if (sourceDir == null) return defaultContent

  const relativePath = path.relative(basePath, filePath) // Calculate relative path from base
  const sourceFilePath = path.join(sourceDir, relativePath)

  if (!(fs.existsSync(sourceFilePath) && fs.statSync(sourceFilePath).isFile())) return defaultContent

  logger?.debug('copying from source', {path: sourceFilePath})
  return fs.readFileSync(sourceFilePath, 'utf8')
}

/**
 * Generate shadow source project directory structure
 * Iterates through the flat bundles object to create directories and files
 * If sourceDir is provided and contains config files, they will be copied instead of using defaults
 */
export function generateShadowSourceProject(
  rootPath: string,
  options: GenerationOptions = {}
): GenerationResult {
  const {sourceDir, logger} = options
  const createdDirs: string[] = []
  const createdFiles: string[] = []
  const existedDirs: string[] = []
  const existedFiles: string[] = []
  const createdDirsSet = new Set<string>() // Track created directories to avoid duplicates

  if (fs.existsSync(rootPath)) { // Ensure root directory exists
    existedDirs.push(rootPath)
    logger?.debug('directory exists', {path: rootPath})
  } else {
    fs.mkdirSync(rootPath, {recursive: true})
    createdDirs.push(rootPath)
    createdDirsSet.add(rootPath)
    logger?.info('created directory', {path: rootPath})
  }

  for (const bundleItem of Object.values(bundles)) { // Iterate through all bundles and create files
    const relativePath = bundleItem.path
    const fullPath = path.join(rootPath, relativePath)
    const dir = path.dirname(fullPath)

    if (!fs.existsSync(dir)) { // Ensure parent directory exists
      fs.mkdirSync(dir, {recursive: true})
      let currentDir = dir // Track all intermediate directories
      while (currentDir !== rootPath && !createdDirsSet.has(currentDir)) {
        createdDirsSet.add(currentDir)
        createdDirs.push(currentDir)
        logger?.info('created directory', {path: currentDir})
        currentDir = path.dirname(currentDir)
      }
    }

    if (fs.existsSync(fullPath)) { // Create or skip file
      existedFiles.push(fullPath)
      logger?.debug('file exists', {path: fullPath})
    } else {
      const content = getFileContent(fullPath, rootPath, sourceDir, bundleItem.content, logger)
      fs.writeFileSync(fullPath, content, 'utf8')
      createdFiles.push(fullPath)
      logger?.info('created file', {path: fullPath})
    }
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
