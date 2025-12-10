import path from 'node:path'
import process from 'node:process'
import { spinner } from '@clack/prompts'
import pc from 'picocolors'
import { PathBuilder } from '../constants/paths'
import { RefDistCleanupService } from '../services/cleanup/RefDistCleanupService'
import { ExportService } from '../services/export/ExportService'
import { cleanAndEnsureDir, findAgentsFiles, pathExists } from '../utils'
import { FrontMatterType } from '../utils/frontMatter'
import { LogAdapter, shutdownLogger } from '../utils/log'
import { generateRuleFile } from '../utils/ruleGenerator'

const log = new LogAdapter('commands/antigravityExporter')

// Build paths using PathBuilder
const aindexPaths = PathBuilder.forProject('aindex')
const AINDEX_ROOT = aindexPaths.root()
const DIST_ROOT = aindexPaths.dist()
const REF_ROOT = aindexPaths.ref()
const AGENT_RULES_DIR = aindexPaths.agent().rules()
const ALWAYS_ON_FRONT_MATTER = `---
trigger: always_on
---

`

function generateAntigravityFrontMatter(globPattern: string): string {
  return `---
trigger: glob
globs: ${globPattern}
---

`
}

function isInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, filePath)
  if (!relativePath) {
    return false
  }
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

function buildUniqueFilename(relativePath: string): string {
  if (relativePath === 'AGENTS.md') {
    return '_project.md'
  }

  const dirName = path.dirname(relativePath).replace(/\\/g, '/')
  return `_${dirName.replace(/[\\/]/g, '_').replace(/\./g, '___')}.md`
}

function buildGlobPattern(relativePath: string): string {
  if (relativePath === 'AGENTS.md') {
    return '**/*'
  }

  const dirPath = path.dirname(relativePath).replace(/\\/g, '/')
  return `${dirPath}/**/*`
}

async function batchGenerateAgentRules(options: {
  sourceFiles: readonly string[]
  basePath: string
  targetDir: string
}): Promise<number> {
  const { sourceFiles, basePath, targetDir } = options
  let exportedCount = 0

  for (const sourceFile of sourceFiles) {
    try {
      const relativePath = path.relative(basePath, sourceFile).replace(/\\/g, '/')
      const uniqueFilename = buildUniqueFilename(relativePath)
      const isRootAgents = relativePath === 'AGENTS.md'
      const globPattern = isRootAgents ? '' : buildGlobPattern(relativePath)
      const frontMatter = isRootAgents
        ? ALWAYS_ON_FRONT_MATTER
        : generateAntigravityFrontMatter(globPattern)
      const targetPath = path.join(targetDir, uniqueFilename)

      const success = await generateRuleFile({
        sourcePath: sourceFile,
        targetPath,
        frontMatter,
        displayName: uniqueFilename,
        logger: log,
      })

      if (success) {
        const descriptor = isRootAgents
          ? 'trigger: always_on'
          : `globs: ${globPattern}`
        log.info('EXPORTED: {} ({}) to .agent/rules', uniqueFilename, descriptor)
        exportedCount++
      }
    } catch (error) {
      log.error('ERROR: Failed to export {}', sourceFile)

      if (error instanceof Error) {
        log.error('  {}', error.message)
      }
    }
  }

  return exportedCount
}

async function processExternalProjectAgentRules(): Promise<number> {
  if (!(await pathExists(REF_ROOT))) {
    log.debug('ref directory not found, skipping external .agent/rules sync')
    return 0
  }

  const cleanupService = new RefDistCleanupService()
  await cleanupService.cleanRefDistDirectories({
    refPath: REF_ROOT,
    preserveFiles: ['AGENTS.md', 'CLAUDE.md', 'README.md'],
    logger: log,
  })

  const exportService = new ExportService()
  const result = await exportService.exportRefProjectsInMemory({
    refPath: REF_ROOT,
    targetPath: AGENT_RULES_DIR,
    frontMatterType: FrontMatterType.ANTIGRAVITY_GLOB,
    logger: log,
  })

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      log.error('Export error: {}', error)
    }
  }

  return result.exported
}

/**
 * CLI command for exporting AGENTS.md files to .agent/rules
 *
 * @deprecated Use `autoSyncCommand` with the plugin system instead.
 * This command is kept for backward compatibility.
 * @see {@link autoSyncCommand} for the plugin-based replacement
 */
export async function antigravityExporterCommand(): Promise<void> {
  const s = spinner()

  try {
    s.start('Finding AGENTS.md files...')

    let agentsFiles = await findAgentsFiles(AINDEX_ROOT, { skipRoot: true, allowScripts: true })

    const beforeFilterCount = agentsFiles.length
    agentsFiles = agentsFiles.filter((file) => {
      if (isInsideDirectory(file, REF_ROOT)) {
        return false
      }
      if (isInsideDirectory(file, DIST_ROOT)) {
        return false
      }
      return true
    })
    const skipped = beforeFilterCount - agentsFiles.length
    if (skipped > 0) {
      log.info('Skipping {} AGENTS.md file(s) under dist/ or ref/', skipped)
    }

    if (agentsFiles.length === 0) {
      s.stop(pc.yellow('No AGENTS.md files found (excluding root)'))
      return
    }

    s.message(`Found ${agentsFiles.length} AGENTS.md files`)

    await cleanAndEnsureDir(AGENT_RULES_DIR)

    let exportedCount = 0

    const rootAgentsFile = path.join(AINDEX_ROOT, 'AGENTS.md')

    if (await pathExists(rootAgentsFile)) {
      const targetPath = path.join(AGENT_RULES_DIR, '_project.md')

      const success = await generateRuleFile({
        sourcePath: rootAgentsFile,
        targetPath,
        frontMatter: ALWAYS_ON_FRONT_MATTER,
        displayName: '_project.md',
        logger: log,
      })

      if (success) {
        log.info('EXPORTED: _project.md (trigger: always_on) to .agent/rules')
        exportedCount++
      }
    }

    exportedCount += await batchGenerateAgentRules({
      sourceFiles: agentsFiles,
      basePath: AINDEX_ROOT,
      targetDir: AGENT_RULES_DIR,
    })

    const externalExported = await processExternalProjectAgentRules()
    exportedCount += externalExported

    s.stop(pc.green(`Successfully exported ${exportedCount} AGENTS.md files to .agent/rules/`))
  } catch (error) {
    s.stop(pc.red('Antigravity export failed'))
    log.error('Error:')
    log.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
