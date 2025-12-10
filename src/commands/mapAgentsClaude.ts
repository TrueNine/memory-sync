import process from 'node:process'
import { intro, outro, spinner } from '@clack/prompts'
import pc from 'picocolors'
import { PathBuilder } from '../constants/paths'
import { SyncService } from '../services/sync/SyncService'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/mapAgentsClaude')

// Build paths using PathBuilder
const aindexPaths = PathBuilder.forProject('aindex')
const AINDEX_ROOT = aindexPaths.root()

/**
 * CLI command for mapping AGENTS.md to CLAUDE.md via symlinks
 *
 * @deprecated Use `autoSyncCommand` with ClaudePlugin instead.
 * This command is kept for backward compatibility.
 * @see {@link autoSyncCommand} for the plugin-based replacement
 */
export async function mapAgentsClaudeCommand(): Promise<void> {
  intro(pc.bgCyan(pc.black(' Agents-Claude Mapping ')))

  const s = spinner()

  try {
    s.start('Starting mapping tasks...')
    s.stop('Ready')

    const syncService = new SyncService()

    log.info('[Task 1] Syncing AGENTS.md files to CLAUDE.md...')
    const syncResult = await syncService.syncAgentsToClaude(AINDEX_ROOT, {
      allowScripts: true,
      logger: log,
    })

    log.debug('Summary: {} file(s) deleted, {} symlink(s) created, {} file(s) copied', syncResult.deleted, syncResult.linked, syncResult.copied)

    if (syncResult.errors.length > 0) {
      log.warn('Encountered {} error(s) during sync', syncResult.errors.length)
      syncResult.errors.forEach((error) => log.error('{}', error))
    }

    const totalSynced = syncResult.linked + syncResult.copied
    if (totalSynced > 0) {
      outro(pc.green('✓ All mapping tasks completed successfully!'))
    } else {
      outro(pc.yellow('⚠ Mapping completed: no changes made'))
    }
  } catch (error) {
    s.stop('Mapping failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
