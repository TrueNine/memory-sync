import process from 'node:process'
import { spinner } from '@clack/prompts'
import pc from 'picocolors'
import { getProjectExcludePatterns, PathBuilder } from '../constants/paths'
import { RefDistCleanupService } from '../services/cleanup/RefDistCleanupService'
import { ExportService } from '../services/export/ExportService'
import { pathExists } from '../utils'
import { loadConfig } from '../utils/config'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/kiroAgentsExport')

/**
 * Core function for exporting AGENTS.md files to Kiro steering directory
 * Can be called from both CLI command and auto sync workflow
 *
 * @deprecated Use KiroPlugin from the plugin system instead.
 * This function is kept for backward compatibility with existing CLI commands.
 * @see {@link createKiroPlugin} for the plugin-based replacement
 */
export async function kiroAgentsExportCore(): Promise<number> {
  const config = await loadConfig()
  const isAindexProject = config.projectName === 'aindex'
  const excludePatterns = getProjectExcludePatterns(config.projectName)

  // Build paths using PathBuilder
  const aindexPaths = PathBuilder.forProject('aindex')
  const aindexRoot = aindexPaths.root()
  const kiroSteeringDir = aindexPaths.kiro().steering()
  const refRoot = aindexPaths.ref()

  const exportService = new ExportService()

  const exportOptions = {
    sourcePath: aindexRoot,
    targetPath: kiroSteeringDir,
    skipRoot: true,
    // Skip ref/ projects to avoid copying unrelated AGENTS.md files into .kiro
    processRefProjects: false,
    logger: log,
    // Enable cleanTarget to remove stale files before export
    cleanTarget: true,
    // Apply project-specific exclude patterns
    excludePatterns,
    ...(isAindexProject && { refPath: refRoot }),
  }

  const result = await exportService.exportToKiro(exportOptions)

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      log.error('Export error: {}', error)
    }
  }

  const exportedCount = result.exported

  // Clean ref dist directories but do NOT export them to .kiro/steering/
  // Per requirement 3.1: aindex project excludes ref/*/dist from Kiro steering export
  if (isAindexProject && (await pathExists(refRoot))) {
    const cleanupService = new RefDistCleanupService()
    await cleanupService.cleanRefDistDirectories({
      refPath: refRoot,
      preserveFiles: ['AGENTS.md', 'CLAUDE.md', 'README.md'],
      logger: log,
    })
  }

  return exportedCount
}

/**
 * CLI command for exporting AGENTS.md files to Kiro steering directory
 *
 * @deprecated Use `autoSyncCommand` with KiroPlugin instead.
 * This command is kept for backward compatibility.
 * @see {@link autoSyncCommand} for the plugin-based replacement
 */
export async function kiroAgentsExportCommand(): Promise<void> {
  const s = spinner()

  try {
    s.start('Finding AGENTS.md files...')

    const exportedCount = await kiroAgentsExportCore()

    if (exportedCount === 0) {
      s.stop(pc.yellow('No AGENTS.md files found (excluding root)'))
      return
    }

    s.stop(pc.green(`Successfully exported ${exportedCount} AGENTS.md files to .kiro/steering/`))
  } catch (error) {
    s.stop(pc.red('Kiro agents export failed'))
    log.error('Error: {}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
