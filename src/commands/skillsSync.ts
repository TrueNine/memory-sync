import path from 'node:path'
import process from 'node:process'
import { spinner } from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { getClaudeSkillsDir, getFactorySkillsDir, PathBuilder } from '../constants/paths'
import { SyncService } from '../services/sync/SyncService'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/skillsSync')

// Build paths using PathBuilder
const aindexPaths = PathBuilder.forProject('aindex')
const DIST_ROOT = aindexPaths.dist()
const REF_ROOT = aindexPaths.ref()
const CLAUDE_SKILLS_DIR = aindexPaths.claude().skills()
const FACTORY_SKILLS_DIR = aindexPaths.factory().skills()

/**
 * Core function to sync skills without UI elements
 * Used internally by autoSyncCommand
 *
 * @deprecated Use SkillsPlugin from the plugin system instead.
 * This function is kept for backward compatibility with existing CLI commands.
 * @see {@link createSkillsPlugin} for the plugin-based replacement
 */
export async function skillsSyncCore(): Promise<number> {
  const sourceDir = path.join(DIST_ROOT, 'skills')

  if (!(await fs.pathExists(sourceDir))) {
    log.warn('Source directory dist/skills/ does not exist')
    return 0
  }

  const syncService = new SyncService()
  const targets: string[] = []

  // Add current project targets
  targets.push(
    CLAUDE_SKILLS_DIR,
    FACTORY_SKILLS_DIR,
  )

  // Add external project targets
  if (await fs.pathExists(REF_ROOT)) {
    const projectDirs = await fs.readdir(REF_ROOT, { withFileTypes: true })

    for (const entry of projectDirs) {
      if (!entry.isDirectory()) {
        continue
      }

      const projectPath = path.join(REF_ROOT, entry.name)
      targets.push(
        getClaudeSkillsDir(projectPath),
        getFactorySkillsDir(projectPath),
      )
    }
  } else {
    log.debug('ref directory not found, skipping external projects sync')
  }

  const result = await syncService.syncSkills(sourceDir, targets, { logger: log })

  if (result.errors.length > 0) {
    log.warn('Encountered {} error(s) during sync', result.errors.length)
    result.errors.forEach((error) => log.error('{}', error))
  }

  return result.copied
}

/**
 * CLI command for syncing skills directory
 *
 * @deprecated Use `autoSyncCommand` with SkillsPlugin instead.
 * This command is kept for backward compatibility.
 * @see {@link autoSyncCommand} for the plugin-based replacement
 */
export async function skillsSyncCommand(): Promise<void> {
  const s = spinner()

  try {
    s.start('Syncing skills directory...')

    const totalSynced = await skillsSyncCore()

    if (totalSynced > 0) {
      s.stop(pc.green(`Successfully synced skills to ${totalSynced} location(s)`))
    } else {
      s.stop(pc.yellow('No locations were synced'))
    }
  } catch (error) {
    s.stop(pc.red('Skills sync failed'))
    log.error('Error:')
    log.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
