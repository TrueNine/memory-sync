import type { Command, CommandContext, CommandResult } from './Command'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadUserConfig } from '@/ConfigLoader'
import {
  DEFAULT_GLOBAL_MEMORY_FILE,
  DEFAULT_SHADOW_FAST_COMMAND_DIR,
  DEFAULT_SHADOW_PROJECT_SUFFIX,
  DEFAULT_SHADOW_PROJECTS_DIR,
  DEFAULT_SHADOW_SKILL_SOURCE_DIR,
  DEFAULT_SHADOW_SUB_AGENT_DIR,
  DEFAULT_WORKSPACE_DIR,
  PathPlaceholders,
} from '@/constants'

/**
 * Resolve path placeholders and tilde
 */
function resolvePath(p: string, workspaceDir: string, shadowSourceProjectDir: string): string {
  let resolved = p
  resolved = resolved.replace(PathPlaceholders.SHADOW_SOURCE_PROJECT, shadowSourceProjectDir)
  resolved = resolved.replace(PathPlaceholders.WORKSPACE, workspaceDir)
  if (resolved.startsWith('~')) {
    resolved = path.join(os.homedir(), resolved.slice(1))
  }
  return path.normalize(resolved)
}

/**
 * Init command - initializes directory structure based on configuration
 */
export class InitCommand implements Command {
  readonly name = 'init'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const { logger } = ctx

    logger.info('initializing directory structure', { command: 'init' })

    // Load user config
    const configResult = loadUserConfig()
    const config = configResult.config

    // Resolve workspace directory
    const workspaceDir = resolvePath(
      config.workspaceDir ?? DEFAULT_WORKSPACE_DIR,
      '',
      '',
    )

    // Resolve shadow source project directory
    const shadowSourceProjectDir = resolvePath(
      config.shadowSourceProjectDir ?? `${PathPlaceholders.WORKSPACE}/${DEFAULT_SHADOW_PROJECT_SUFFIX}`,
      workspaceDir,
      '',
    )

    // Resolve all directories
    const skillsDir = resolvePath(
      config.shadowSkillSourceDir ?? DEFAULT_SHADOW_SKILL_SOURCE_DIR,
      workspaceDir,
      shadowSourceProjectDir,
    )
    const commandsDir = resolvePath(
      config.shadowFastCommandDir ?? DEFAULT_SHADOW_FAST_COMMAND_DIR,
      workspaceDir,
      shadowSourceProjectDir,
    )
    const agentsDir = resolvePath(
      config.shadowSubAgentDir ?? DEFAULT_SHADOW_SUB_AGENT_DIR,
      workspaceDir,
      shadowSourceProjectDir,
    )
    const shadowProjectsDir = resolvePath(
      config.shadowProjectsDir ?? DEFAULT_SHADOW_PROJECTS_DIR,
      workspaceDir,
      shadowSourceProjectDir,
    )
    const globalMemoryFile = resolvePath(
      config.globalMemoryFile ?? DEFAULT_GLOBAL_MEMORY_FILE,
      workspaceDir,
      shadowSourceProjectDir,
    )

    const dirsToCreate = [
      { path: workspaceDir, name: 'workspace' },
      { path: shadowSourceProjectDir, name: 'shadow source project' },
      { path: skillsDir, name: 'skills' },
      { path: commandsDir, name: 'commands' },
      { path: agentsDir, name: 'agents' },
      { path: shadowProjectsDir, name: 'shadow projects' },
    ]

    let dirsCreated = 0
    let dirsExisted = 0
    let filesCreated = 0
    let filesExisted = 0

    // Create directories
    for (const dir of dirsToCreate) {
      if (!fs.existsSync(dir.path)) {
        fs.mkdirSync(dir.path, { recursive: true })
        logger.info('created directory', { name: dir.name, path: dir.path })
        dirsCreated++
      } else {
        logger.debug('directory already exists', { name: dir.name, path: dir.path })
        dirsExisted++
      }
    }

    // Create global memory file if it doesn't exist
    const globalMemoryDir = path.dirname(globalMemoryFile)
    if (!fs.existsSync(globalMemoryDir)) {
      fs.mkdirSync(globalMemoryDir, { recursive: true })
      dirsCreated++
    }

    if (!fs.existsSync(globalMemoryFile)) {
      fs.writeFileSync(globalMemoryFile, '# Global Memory\n\n', 'utf-8')
      logger.info('created global memory file', { path: globalMemoryFile })
      filesCreated++
    } else {
      logger.debug('global memory file already exists', { path: globalMemoryFile })
      filesExisted++
    }

    logger.info('Initialization complete', {
      dirsCreated,
      dirsExisted,
      filesCreated,
      filesExisted,
    })

    const message = dirsCreated === 0 && filesCreated === 0
      ? `All ${dirsExisted} directories and ${filesExisted} files already exist`
      : `Created ${dirsCreated} directories and ${filesCreated} files (${dirsExisted} dirs, ${filesExisted} files already existed)`

    return {
      success: true,
      filesAffected: filesCreated,
      dirsAffected: dirsCreated,
      message,
    }
  }
}
