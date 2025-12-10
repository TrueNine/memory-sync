import path from 'node:path'
import process from 'node:process'
import { intro, outro, spinner } from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { PathBuilder } from '../constants/paths'
import { getAllFiles, linkOrCopyFile as linkOrCopyFileUtil, pathExists } from '../utils'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/docLink')

/**
 * Configuration for docLink command
 */
export interface DocLinkConfig {
  /**
   * Path to the projects directory containing .md files
   */
  projectsDir: string

  /**
   * Path to the ref directory
   */
  refDir: string

  /**
   * Path to the .gitignore file
   */
  gitignorePath: string
}

interface LinkResult {
  linked: number
  skipped: number
  errors: string[]
}

/**
 * Get all project names from projects directory
 */
async function getProjectNames(projectsDir: string): Promise<string[]> {
  const projectNames: string[] = []

  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const projectName = path.basename(entry.name, '.md')
        projectNames.push(projectName)
      }
    }
  } catch (error) {
    log.error('Failed to read projects directory: {}', error instanceof Error ? error.message : String(error))
  }

  return projectNames.sort()
}

/**
 * Link or copy file from source to target
 * First attempts to create a symbolic link, falls back to copying if that fails
 */
async function linkOrCopyFile(source: string, target: string): Promise<boolean> {
  return linkOrCopyFileUtil(source, target)
}

/**
 * Create symbolic links for project documentation
 */
async function linkProjectDocs(config: DocLinkConfig): Promise<LinkResult> {
  const { projectsDir, refDir } = config

  const result: LinkResult = {
    linked: 0,
    skipped: 0,
    errors: [],
  }

  if (!(await pathExists(projectsDir))) {
    result.errors.push(`Projects directory not found: ${projectsDir}`)
    return result
  }

  if (!(await pathExists(refDir))) {
    result.errors.push(`Ref directory not found: ${refDir}`)
    return result
  }

  log.debug('Using projects directory at {}', projectsDir)

  const projectNames = await getProjectNames(projectsDir)

  if (projectNames.length === 0) {
    log.warn('No project files found in projects directory')
    return result
  }

  for (const projectName of projectNames) {
    const projectFile = path.join(projectsDir, `${projectName}.md`)
    const projectDir = path.join(projectsDir, projectName)
    const refProjectDir = path.join(refDir, projectName)
    const docDir = path.join(refProjectDir, '.doc')

    if (!(await pathExists(refProjectDir))) {
      log.debug('Skipping project {} (no corresponding ref directory)', projectName)
      result.skipped++
      continue
    }

    const readmeLinkPath = path.join(docDir, 'README.md')
    const linked = await linkOrCopyFile(projectFile, readmeLinkPath)

    if (linked) {
      result.linked++
    }

    const projectDirExists = await pathExists(projectDir)

    if (projectDirExists) {
      const files = await getAllFiles(projectDir)

      for (const file of files) {
        const relativePath = path.relative(projectDir, file)
        const linkPath = path.join(docDir, relativePath)
        const fileLinked = await linkOrCopyFile(file, linkPath)

        if (fileLinked) {
          result.linked++
        }
      }
    }
  }

  return result
}

/**
 * Update .gitignore to exclude .doc directories
 */
async function updateGitignore(gitignorePath: string): Promise<boolean> {
  const docIgnorePattern = '**/.doc/'

  try {
    let content = ''

    if (await pathExists(gitignorePath)) {
      content = await fs.readFile(gitignorePath, 'utf-8')
    }

    const lines = content.split(/\r?\n/)
    const hasPattern = lines.some((line) => line.trim() === docIgnorePattern)

    if (hasPattern) {
      log.debug('.gitignore already contains .doc/ pattern')
      return false
    }

    if (content && !content.endsWith('\n')) {
      content += '\n'
    }

    content += `${docIgnorePattern}\n`
    await fs.writeFile(gitignorePath, content, 'utf-8')
    log.info('Added .doc/ pattern to .gitignore')
    return true
  } catch (error) {
    log.error('Failed to update .gitignore: {}', error instanceof Error ? error.message : String(error))
    return false
  }
}

/**
 * Core function to link project documentation without UI elements
 * Used internally by autoSyncCommand
 *
 * @param config - Configuration for the docLink operation
 */
export async function linkProjectDocsCore(config: DocLinkConfig): Promise<LinkResult> {
  const linkResult = await linkProjectDocs(config)

  if (linkResult.errors.length > 0) {
    for (const error of linkResult.errors) {
      log.error('Error: {}', error)
    }
    throw new Error('Document linking failed')
  }

  log.debug('Summary: {} linked, {} skipped', linkResult.linked, linkResult.skipped)

  const gitignoreUpdated = await updateGitignore(config.gitignorePath)

  if (gitignoreUpdated) {
    log.debug('.gitignore updated successfully')
  }

  return linkResult
}

/**
 * Create default configuration for aindex project
 */
export function createDefaultDocLinkConfig(): DocLinkConfig {
  const aindexPaths = PathBuilder.forProject('aindex')

  return {
    projectsDir: aindexPaths.resolve('projects'),
    refDir: aindexPaths.ref(),
    gitignorePath: aindexPaths.resolve('.gitignore'),
  }
}

export async function docLinkCommand(): Promise<void> {
  intro(pc.bgCyan(pc.black(' Document Linking ')))

  const s = spinner()

  try {
    s.start('Creating symbolic links for project documentation...')
    s.stop('Ready')

    log.info('[Task 1] Linking project documentation files...')

    const config = createDefaultDocLinkConfig()
    const linkResult = await linkProjectDocsCore(config)

    if (linkResult.linked > 0) {
      outro(pc.green('✓ Document linking completed successfully!'))
    } else {
      outro(pc.yellow('⚠ Document linking completed: no changes made'))
    }
  } catch (error) {
    s.stop('Document linking failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    outro(pc.red('✗ Document linking failed'))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
