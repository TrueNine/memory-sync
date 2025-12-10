import path from 'node:path'
import process from 'node:process'
import { spinner } from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { KiroPathBuilder, PathBuilder } from '../constants/paths'
import { YAML_FRONT_MATTER_KIRO_ALWAYS } from '../constants/templates'
import { cleanAndEnsureDir, pathExists } from '../utils'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/kiroSteeringExport')

// Build paths using PathBuilder
const aindexPaths = PathBuilder.forProject('aindex')
const DIST_ROOT = aindexPaths.dist()
const KIRO_STEERING_GLOBAL_DIR = KiroPathBuilder.globalSteering()

/**
 * Core function for exporting GLOBAL.md to global Kiro steering directory
 * Only exports to user home directory (~/.kiro/steering/)
 * Can be called from both CLI command and auto sync workflow
 *
 * @deprecated Use GlobalPromptPlugin from the plugin system instead.
 * This function is kept for backward compatibility with existing CLI commands.
 * @see {@link createGlobalPromptPlugin} for the plugin-based replacement
 */
export async function kiroSteeringExportCore(): Promise<boolean> {
  const sourcePath = path.join(DIST_ROOT, 'GLOBAL.md')
  const globalTargetPath = path.join(KIRO_STEERING_GLOBAL_DIR, 'GLOBAL.md')

  // Check if source file exists
  if (!(await pathExists(sourcePath))) {
    log.error('Source file not found: {}', sourcePath)
    return false
  }

  // Read source content
  const content = await fs.readFile(sourcePath, 'utf-8')

  // Prepend YAML front matter
  const outputContent = YAML_FRONT_MATTER_KIRO_ALWAYS + content

  // Clean and ensure target directory exists
  await cleanAndEnsureDir(KIRO_STEERING_GLOBAL_DIR)

  // Write to global target
  await fs.writeFile(globalTargetPath, outputContent)

  log.info('Exported GLOBAL.md to {}', globalTargetPath)
  return true
}

/**
 * CLI command for exporting GLOBAL.md to Kiro steering directory
 *
 * @deprecated Use `autoSyncCommand` with GlobalPromptPlugin instead.
 * This command is kept for backward compatibility.
 * @see {@link autoSyncCommand} for the plugin-based replacement
 */
export async function kiroSteeringExportCommand(): Promise<void> {
  const s = spinner()

  try {
    s.start('Exporting GLOBAL.md to Kiro steering directory...')

    const success = await kiroSteeringExportCore()

    if (success) {
      const targetPath = path.join(KIRO_STEERING_GLOBAL_DIR, 'GLOBAL.md')
      s.stop(pc.green(`Successfully exported to ${targetPath}`))
    } else {
      s.stop(pc.red('Export failed: source file dist/GLOBAL.md not found'))
      process.exitCode = 1
    }
  } catch (error) {
    s.stop(pc.red('Export failed'))
    log.error('Error: {}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
