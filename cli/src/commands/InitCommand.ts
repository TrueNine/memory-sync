import type {Command, CommandContext, CommandResult} from './Command'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {generateAindex} from '@/Aindex'
import {DEFAULT_CONFIG_FILE_NAME, ensureConfigLink, getGlobalConfigPath} from '@/ConfigLoader'

function resolveWorkspacePath(workspaceDir: string): string {
  if (workspaceDir === '~') return os.homedir()
  if (workspaceDir.startsWith('~/') || workspaceDir.startsWith('~\\')) return path.join(os.homedir(), workspaceDir.slice(2))
  return path.normalize(workspaceDir)
}

function linkCwdConfig(logger: CommandContext['logger']): void {
  const globalConfigPath = getGlobalConfigPath()
  const cwdConfigPath = path.join(process.cwd(), DEFAULT_CONFIG_FILE_NAME)
  ensureConfigLink(cwdConfigPath, globalConfigPath, logger)
}

export class InitCommand implements Command {
  readonly name = 'init'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, userConfigOptions} = ctx

    logger.info('initializing aindex structure', {command: 'init'})

    const workspaceDir = resolveWorkspacePath(userConfigOptions.workspaceDir)
    const aindexDir = path.join(workspaceDir, userConfigOptions.aindex.dir)

    const result = generateAindex(aindexDir, {logger, config: userConfigOptions.aindex})
    try {
      linkCwdConfig(logger)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        filesAffected: result.createdFiles.length,
        dirsAffected: result.createdDirs.length,
        message: errorMessage
      }
    }

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
