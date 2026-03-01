import type {Command, CommandContext, CommandResult} from './Command'
import * as os from 'node:os'
import * as path from 'node:path'
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
