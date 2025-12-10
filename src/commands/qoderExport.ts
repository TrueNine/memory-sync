import path from 'node:path'
import process from 'node:process'
import { spinner } from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { getProjectExcludePatterns, PathBuilder } from '../constants/paths'
import { RefDistCleanupService } from '../services/cleanup/RefDistCleanupService'
import { ExportService } from '../services/export/ExportService'
import { loadConfig } from '../utils/config'
import { FrontMatterType } from '../utils/frontMatter'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/qoderExport')

// Build paths using PathBuilder
const aindexPaths = PathBuilder.forProject('aindex')
const AINDEX_ROOT = aindexPaths.root()
const REF_ROOT = aindexPaths.ref()
const QODER_RULES_DIR = aindexPaths.qoder().rules()
const CODEBUDDY_RULES_DIR = aindexPaths.codebuddy().rules()

/**
 * Copy qoder rules to codebuddy directory with .mdc extension
 */
async function copyToCodebuddy(qoderDir: string, codebuddyDir: string): Promise<void> {
  // Clean codebuddy directory before copying to remove stale files
  await fs.emptyDir(codebuddyDir)

  const files = await fs.readdir(qoderDir)

  for (const file of files) {
    if (file.endsWith('.md')) {
      const sourcePath = path.join(qoderDir, file)
      const targetPath = path.join(codebuddyDir, file.replace(/\.md$/, '.mdc'))
      await fs.copyFile(sourcePath, targetPath)
    }
  }
}

/**
 * Export AGENTS.md files to qoder rules
 *
 * @deprecated Use `autoSyncCommand` with QoderPlugin instead.
 * This command is kept for backward compatibility.
 * @see {@link autoSyncCommand} for the plugin-based replacement
 */
export async function qoderExportCommand(): Promise<void> {
  const s = spinner()

  try {
    const config = await loadConfig()
    const isAindexProject = config.projectName === 'aindex'
    const excludePatterns = getProjectExcludePatterns(config.projectName)

    s.start('Exporting AGENTS.md files to qoder...')

    const exportService = new ExportService()
    const cleanupService = new RefDistCleanupService()

    // Clean up ref dist directories before processing
    if (isAindexProject && (await fs.pathExists(REF_ROOT))) {
      s.message('Cleaning ref/*/dist/ directories...')
      const cleanupResult = await cleanupService.cleanRefDistDirectories({
        refPath: REF_ROOT,
        preserveFiles: ['AGENTS.md', 'CLAUDE.md', 'README.md'],
        logger: log,
      })

      if (cleanupResult.errors.length > 0) {
        for (const error of cleanupResult.errors) {
          log.warn('Cleanup warning: {}', error)
        }
      }
    }

    // Export to qoder (without processing ref projects in the old way)
    const result = await exportService.exportToQoder({
      sourcePath: AINDEX_ROOT,
      targetPath: QODER_RULES_DIR,
      skipRoot: false,
      processRefProjects: false,
      refPath: REF_ROOT,
      logger: log,
      // Enable cleanTarget to remove stale files before export
      cleanTarget: true,
      // Apply project-specific exclude patterns
      excludePatterns,
    })

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        log.error('Export error: {}', error)
      }
    }

    // Export ref projects using memory-based processing
    if (isAindexProject && (await fs.pathExists(REF_ROOT))) {
      s.message('Exporting ref projects in memory...')
      const refResult = await exportService.exportRefProjectsInMemory({
        refPath: REF_ROOT,
        targetPath: QODER_RULES_DIR,
        frontMatterType: FrontMatterType.QODER_GLOB,
        logger: log,
      })

      result.exported += refResult.exported
      result.errors.push(...refResult.errors)

      if (refResult.errors.length > 0) {
        for (const error of refResult.errors) {
          log.error('Ref export error: {}', error)
        }
      }
    }

    if (result.exported === 0) {
      s.stop(pc.yellow('No AGENTS.md files found'))
      return
    }

    // Copy qoder rules to codebuddy with .mdc extension
    s.message('Copying to codebuddy...')
    await copyToCodebuddy(QODER_RULES_DIR, CODEBUDDY_RULES_DIR)

    s.stop(pc.green(`Successfully exported ${result.exported} AGENTS.md files to .qoder/rules/ and .codebuddy/.rules/`))
  } catch (error) {
    s.stop(pc.red('Qoder export failed'))
    log.error('Error: {}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
