import type {Command, CommandContext, CommandResult} from './Command'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {DEFAULT_CONFIG_FILE_NAME, getGlobalConfigPath} from '@/ConfigLoader'
import {generateShadowSourceProject} from '@/ShadowSourceProject'

/**
 * Resolve tilde and workspace path
 */
function resolveWorkspacePath(workspaceDir: string): string {
  let resolved = workspaceDir
  if (resolved.startsWith('~')) resolved = path.join(os.homedir(), resolved.slice(1))
  return path.normalize(resolved)
}

/**
 * Link cwd config to global config via symlink.
 * Falls back to a file copy with a warning if symlink creation fails (e.g. Windows without Developer Mode).
 */
function linkCwdConfig(logger: CommandContext['logger']): void {
  const globalConfigPath = getGlobalConfigPath()
  const cwdConfigPath = path.join(process.cwd(), DEFAULT_CONFIG_FILE_NAME)

  if (fs.existsSync(cwdConfigPath)) {
    logger.debug('cwd config already exists, skipping link', {path: cwdConfigPath})
    return
  }

  try {
    fs.symlinkSync(globalConfigPath, cwdConfigPath, 'file')
    logger.info('linked cwd config to global config', {link: cwdConfigPath, target: globalConfigPath})
  }
  catch (symlinkError) {
    logger.warn('symlink failed, falling back to file copy', {error: symlinkError instanceof Error ? symlinkError.message : String(symlinkError)})
    try {
      fs.copyFileSync(globalConfigPath, cwdConfigPath)
      logger.info('copied global config to cwd', {src: globalConfigPath, dest: cwdConfigPath})
    }
    catch (copyError) {
      logger.error('failed to copy global config to cwd', {error: copyError instanceof Error ? copyError.message : String(copyError)})
    }
  }
}

/**
 * Init command - initializes shadow source project directory structure
 */
export class InitCommand implements Command {
  readonly name = 'init'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, userConfigOptions} = ctx

    logger.info('initializing shadow source project structure', {command: 'init'})

    const workspaceDir = resolveWorkspacePath(userConfigOptions.workspaceDir) // Resolve workspace directory from user config

    const shadowSourceProjectDir = path.join(workspaceDir, userConfigOptions.shadowSourceProject.name) // Resolve shadow source project directory from config name

    const result = generateShadowSourceProject(shadowSourceProjectDir, {logger}) // Generate shadow source project structure

    linkCwdConfig(logger) // Link cwd config to global config

    const message = result.createdDirs.length === 0 && result.createdFiles.length === 0
      ? `All ${result.existedDirs.length} directories and ${result.existedFiles.length} files already exist`
      : `Created ${result.createdDirs.length} directories and ${result.createdFiles.length} files (${result.existedDirs.length} dirs, ${result.existedFiles.length} files already existed)`

    logger.info('initialization complete', {
      dirsCreated: result.createdDirs.length,
      filesCreated: result.createdFiles.length,
      dirsExisted: result.existedDirs.length,
      filesExisted: result.existedFiles.length
    })

    return {
      success: result.success,
      filesAffected: result.createdFiles.length,
      dirsAffected: result.createdDirs.length,
      message
    }
  }
}
