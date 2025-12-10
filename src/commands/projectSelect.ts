import type { ProjectSelection, SupportArtifact } from '../types'
import path from 'node:path'
import process from 'node:process'
import { intro, multiselect, note, outro, spinner } from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { PROMPT_DIRECTORIES, PROMPT_TARGETS, SUPPORT_ARTIFACTS } from '../constants'
import { PathBuilder, USER_HOME, USER_PROJECTS_DIR } from '../constants/paths'
import {
  copyDirectory,
  copyFile,
  ensureDirectoryLink,
  getAllFiles,
  getFirstLevelDirs,
  pathExists,
  resolvePath,
} from '../utils'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/projectSelect')

// Build paths using PathBuilder
const aindexPaths = PathBuilder.forProject('aindex')
const AINDEX_ROOT = aindexPaths.root()
const DIST_ROOT = aindexPaths.dist()
const REF_ROOT = aindexPaths.ref()
const CLAUDE_COMMANDS_DIR = aindexPaths.claude().commands()
const CLAUDE_AGENTS_DIR = aindexPaths.claude().agents()
const FACTORY_COMMANDS_DIR = aindexPaths.factory().commands()

async function syncGlobalPrompt(): Promise<void> {
  const globalPromptPath = path.join(DIST_ROOT, 'GLOBAL.md')

  const globalExists = await pathExists(globalPromptPath)
  const content = globalExists ? await fs.readFile(globalPromptPath, 'utf-8') : ''

  if (!globalExists) {
    log.warn('Global prompt not found at {}', globalPromptPath)
  }

  for (const target of PROMPT_TARGETS) {
    const targetPath = resolvePath({ base: USER_HOME, segments: target.segments })
    await fs.ensureDir(path.dirname(targetPath))

    if (content !== '') {
      await fs.writeFile(targetPath, content)
      log.info('Synced GLOBAL.md to {}', targetPath)
      continue
    }

    const exists = await pathExists(targetPath)
    if (!exists) {
      await fs.writeFile(targetPath, '')
      log.info('Created placeholder file at {}', targetPath)
    }
  }
}

export async function projectSelectCommand(): Promise<ProjectSelection | undefined> {
  intro(pc.bgCyan(pc.black(' Project Selection ')))

  log.debug('User directory: {}', USER_HOME)

  const s = spinner()
  let result: ProjectSelection | undefined

  try {
    const airefPath = REF_ROOT

    s.start('Reading project directories...')

    if (!(await pathExists(airefPath))) {
      s.stop('Directory not found')
      outro(pc.red(`Directory not found: ${airefPath}`))
      process.exitCode = 1
      return
    }

    const projectDirs = await getFirstLevelDirs(airefPath)
    s.stop('Directories loaded')

    const selectableDirs = projectDirs.filter((dir) => dir !== 'aindex')

    if (selectableDirs.length === 0) {
      outro(pc.yellow(`No selectable directories found in ${airefPath}`))
      return
    }

    note(
      pc.dim(`Found ${selectableDirs.length} directories in:\n${pc.cyan(airefPath)}`),
      'Available directories',
    )

    const toggleValue = '__toggle_all__'
    let finalSelection: string[] = []

    while (true) {
      const selectedDirs = await multiselect({
        message: 'Select a project directory (space to select, enter to confirm):',
        options: [
          {
            value: toggleValue,
            label: 'Select All / Deselect All',
          },
          ...selectableDirs.map((dir) => ({
            value: dir,
            label: dir,
          })),
        ],
        required: false,
        initialValues: finalSelection,
      })

      if (typeof selectedDirs === 'symbol') {
        outro(pc.gray('Operation cancelled'))
        return
      }

      const selection = Array.isArray(selectedDirs) ? selectedDirs : []

      if (selection.includes(toggleValue)) {
        if (finalSelection.length === selectableDirs.length) {
          finalSelection = []
        } else {
          finalSelection = [...selectableDirs]
        }
        continue
      }

      finalSelection = selection
      break
    }

    if (finalSelection.length === 0) {
      outro(pc.gray('No project selected, exiting'))
      return
    }

    const selectedDir = finalSelection[0]

    note(pc.green(`✓ ${selectedDir}`), 'Selected project')

    await copyPromptsToProjects(airefPath, finalSelection)

    outro(pc.green('✓ Prompt copy complete'))

    result = {
      airefPath,
      selectedDirs: finalSelection,
    }
  } catch (error) {
    s.stop('Operation failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }

  return result
}

async function syncCommandsToCurrentProject(): Promise<void> {
  const commandsSourcePath = path.join(AINDEX_ROOT, '_ai', 'dist', 'commands')

  const commandsExists = await pathExists(commandsSourcePath)
  if (!commandsExists) {
    log.warn('Commands source not found at {}', commandsSourcePath)
    return
  }

  const targets = [
    { label: 'Claude Commands', path: CLAUDE_COMMANDS_DIR },
    { label: 'Factory Commands', path: FACTORY_COMMANDS_DIR },
  ]

  for (const target of targets) {
    const copied = await copyDirectory({ source: commandsSourcePath, target: target.path })

    if (copied) {
      log.info('Synced {} to {}', target.label, target.path)
    } else {
      log.warn('Failed to sync {}', target.label)
    }
  }
}

async function syncAgentsToCurrentProject(): Promise<void> {
  const agentsSourcePath = path.join(AINDEX_ROOT, '_ai', 'dist', 'agents')

  const agentsExists = await pathExists(agentsSourcePath)
  if (!agentsExists) {
    log.warn('Agents source not found at {}', agentsSourcePath)
    return
  }

  const copied = await copyDirectory({ source: agentsSourcePath, target: CLAUDE_AGENTS_DIR })

  if (copied) {
    log.info('Synced Claude Agents to {}', CLAUDE_AGENTS_DIR)
  } else {
    log.warn('Failed to sync Claude Agents')
  }
}

async function copyPromptsToProjects(airefPath: string, selectedDirs: string[]): Promise<void> {
  const s = spinner()

  try {
    s.start('Copying prompts from ref/<project>/dist...')

    await syncGlobalPrompt()
    await syncCommandsToCurrentProject()
    await syncAgentsToCurrentProject()
    await syncPromptDirectories()

    let totalCopied = 0
    let totalDirsSynced = 0
    let totalFilesSynced = 0

    for (const dir of selectedDirs) {
      const airefProjectPath = path.join(airefPath, dir)
      const distPath = path.join(airefProjectPath, 'dist')

      if (!(await pathExists(airefProjectPath))) {
        log.warn('Skipping {}: ref directory does not exist', dir)
        continue
      }

      const projectRoot = await resolveProjectRoot(dir)

      if (projectRoot === null) {
        continue
      }

      const codeLinkPath = path.join(airefProjectPath, '.code')
      const linkCreated = await ensureDirectoryLink({
        source: projectRoot,
        link: codeLinkPath,
      })

      if (linkCreated) {
        log.info('Linked code directory to {}', codeLinkPath)
      } else {
        log.warn('Failed to link code directory for {}', dir)
      }

      const syncedArtifacts = await syncSupportArtifacts(projectRoot, SUPPORT_ARTIFACTS)

      if (syncedArtifacts.directories > 0 || syncedArtifacts.files > 0) {
        totalDirsSynced += syncedArtifacts.directories
        totalFilesSynced += syncedArtifacts.files
        log.info(
          'Synced support artifacts (directories: {}, files: {}) for {}',
          syncedArtifacts.directories,
          syncedArtifacts.files,
          projectRoot,
        )
      }

      if (!(await pathExists(distPath))) {
        log.warn('Skipping {}: No dist directory found at {}', dir, distPath)
        continue
      }

      log.info('Processing {}:', dir)

      const distFiles = await getAllFiles(distPath)

      if (distFiles.length === 0) {
        log.debug('No files found in {}', distPath)
        continue
      }

      for (const distFile of distFiles) {
        const relativePath = path.relative(distPath, distFile)
        const pathSegments = relativePath.split(path.sep)

        const targetPath = path.join(projectRoot, ...pathSegments)

        await fs.ensureDir(path.dirname(targetPath))
        await fs.copy(distFile, targetPath, { overwrite: true })
        totalCopied++
        log.info('Copied: {}', pathSegments.join(path.sep))
      }
    }

    s.stop('Copy complete')

    if (totalCopied > 0 || totalDirsSynced > 0 || totalFilesSynced > 0) {
      log.info(
        'Copy complete: {} files copied, {} support directories synced, {} support files synced',
        totalCopied,
        totalDirsSynced,
        totalFilesSynced,
      )
    } else {
      log.warn('No files were copied')
    }
  } catch (error) {
    s.stop('Copy failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
  }
}

async function resolveProjectRoot(dir: string): Promise<string | null> {
  const targetRoot = path.join(USER_PROJECTS_DIR, dir)

  const normalizedTargetRoot = process.platform === 'win32'
    ? targetRoot.replace(/^([a-z]):\\/i, (_match: string, drive: string) => `${drive.toUpperCase()}:\\`)
    : targetRoot

  if (!(await pathExists(normalizedTargetRoot))) {
    log.warn('Skipping {}: Target directory not found at {}', dir, normalizedTargetRoot)
    return null
  }

  return normalizedTargetRoot
}

async function syncSupportArtifacts(
  projectRoot: string,
  artifacts: readonly SupportArtifact[],
): Promise<{ directories: number, files: number }> {
  let directories = 0
  let files = 0

  for (const artifact of artifacts) {
    const sourcePath = resolvePath({ base: AINDEX_ROOT, segments: artifact.sourceSegments })
    const targetPath = resolvePath({ base: projectRoot, segments: artifact.targetSegments })

    if (artifact.type === 'directory') {
      const copied = await copyDirectory({
        source: sourcePath,
        target: targetPath,
        ignore: artifact.ignore ?? [],
        onIgnore: async (ignoredPath) => {
          log.debug('Ignored {}', ignoredPath)
        },
      })

      if (copied) {
        directories += 1
      }

      continue
    }

    const copied = await copyFile({ source: sourcePath, target: targetPath })

    if (copied) {
      files += 1
    }
  }

  return { directories, files }
}

async function syncPromptDirectories(): Promise<void> {
  for (const directoryExport of PROMPT_DIRECTORIES) {
    const sourcePath = resolvePath({ base: AINDEX_ROOT, segments: directoryExport.sourceSegments })
    const targetPath = resolvePath({ base: USER_HOME, segments: directoryExport.targetSegments })

    const copied = await copyDirectory({ source: sourcePath, target: targetPath })

    if (copied) {
      log.info('Synced {} to {}', directoryExport.label, targetPath)
      continue
    }

    log.warn('Skipped {}: source not found at {}', directoryExport.label, sourcePath)
  }
}
