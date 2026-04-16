import type {ILogger, OutputAdaptor, OutputCleanContext, OutputCleanupDeclarations} from '../src/adaptors/adaptor-core'
import type {ListPromptsOptions, PromptServiceOptions, UpsertPromptSourceInput, WritePromptArtifactsInput} from '../src/prompts'
import * as fs from 'node:fs'
import {createRequire} from 'node:module'
import * as path from 'node:path'
import glob from 'fast-glob'
import {AdaptorKind, FilePathKind} from '../src/adaptors/adaptor-core/enums.ts'
import {findAllGitReposFallback, findGitModuleInfoDirsFallback, resolveGitInfoDirFallback} from '../src/adaptors/adaptor-core/git-discovery'
import {getPrompt, listPrompts, upsertPromptSource, writePromptArtifacts} from '../src/internal/prompts-legacy'
import {topologicalSortFallback} from '../src/pipeline/DependencyResolver'
import {
  getEffectiveHomeDirFallback,
  getGlobalConfigPathFallback,
  getRequiredGlobalConfigPathFallback,
  isWslRuntimeFallback,
  resolveRuntimeEnvironmentFallback
} from '../src/runtime-environment'

import * as wslMirrorSyncLegacy from '../src/wsl-mirror-sync-legacy'

import {collectBaseOutputPlans, collectDroidOutputPlan, collectGeminiOutputPlan} from './native-binding/base-output-plans'
import * as deskPaths from './native-binding/desk-paths'

interface NativeCleanupTarget {
  readonly path: string
  readonly kind: 'file' | 'directory' | 'glob'
  readonly excludeBasenames?: readonly string[]
  readonly protectionMode?: 'direct' | 'recursive'
  readonly scope?: string
  readonly label?: string
}

interface NativeCleanupDeclarations {
  readonly delete?: readonly NativeCleanupTarget[]
  readonly protect?: readonly NativeCleanupTarget[]
  readonly excludeScanGlobs?: readonly string[]
}

interface NativePluginCleanupSnapshot {
  readonly pluginName: string
  readonly outputs: readonly string[]
  readonly cleanup: NativeCleanupDeclarations
}

interface NativeProtectedRule {
  readonly path: string
  readonly protectionMode: 'direct' | 'recursive'
  readonly reason: string
  readonly source: string
  readonly matcher?: 'path' | 'glob'
}

interface NativeCleanupSnapshot {
  readonly workspaceDir: string
  readonly aindexDir?: string
  readonly projectRoots: readonly string[]
  readonly protectedRules: readonly NativeProtectedRule[]
  readonly pluginSnapshots: readonly NativePluginCleanupSnapshot[]
}

function createMockLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {}
  } satisfies ILogger
}

function createSyntheticOutputAdaptor(snapshot: NativePluginCleanupSnapshot): OutputAdaptor {
  return {
    type: AdaptorKind.Output,
    name: snapshot.pluginName,
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return snapshot.outputs.map(output => ({path: output, source: {}}))
    },
    async declareCleanupPaths(): Promise<OutputCleanupDeclarations> {
      return {
        ...snapshot.cleanup.delete != null ? {delete: [...snapshot.cleanup.delete] as OutputCleanupDeclarations['delete']} : {},
        ...snapshot.cleanup.protect != null ? {protect: [...snapshot.cleanup.protect] as OutputCleanupDeclarations['protect']} : {},
        ...snapshot.cleanup.excludeScanGlobs != null ? {excludeScanGlobs: [...snapshot.cleanup.excludeScanGlobs]} : {}
      }
    },
    async convertContent() {
      return ''
    }
  }
}

async function createSyntheticCleanContext(snapshot: NativeCleanupSnapshot): Promise<OutputCleanContext> {
  const {mergeConfig} = await import('../src/config')
  const workspaceDir = path.resolve(snapshot.workspaceDir)

  return {
    logger: createMockLogger(),
    fs,
    path,
    glob,
    dryRun: false,
    pluginOptions: mergeConfig({
      workspaceDir
    }),
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceDir,
          getDirectoryName: () => path.basename(workspaceDir),
          getAbsolutePath: () => workspaceDir
        },
        projects: snapshot.projectRoots.map(projectRoot => ({
          dirFromWorkspacePath: {
            pathKind: FilePathKind.Relative,
            path: path.relative(workspaceDir, projectRoot) || '.',
            basePath: workspaceDir,
            getDirectoryName: () => path.basename(projectRoot),
            getAbsolutePath: () => projectRoot
          }
        }))
      }
    }
  } as unknown as OutputCleanContext
}

async function planCleanup(snapshotJson: string): Promise<string> {
  const {collectDeletionTargets} = await import('./native-binding/cleanup')
  const snapshot = JSON.parse(snapshotJson) as NativeCleanupSnapshot
  const outputPlugins = snapshot.pluginSnapshots.map(createSyntheticOutputAdaptor)
  const cleanCtx = await createSyntheticCleanContext(snapshot)
  const result = await collectDeletionTargets(outputPlugins, cleanCtx)

  return JSON.stringify({
    filesToDelete: result.filesToDelete,
    dirsToDelete: result.dirsToDelete,
    emptyDirsToDelete: result.emptyDirsToDelete,
    violations: result.violations,
    conflicts: result.conflicts,
    excludedScanGlobs: result.excludedScanGlobs
  })
}

async function runCleanup(snapshotJson: string): Promise<string> {
  const {performCleanup} = await import('./native-binding/cleanup')
  const snapshot = JSON.parse(snapshotJson) as NativeCleanupSnapshot
  const outputPlugins = snapshot.pluginSnapshots.map(createSyntheticOutputAdaptor)
  const cleanCtx = await createSyntheticCleanContext(snapshot)
  const result = await performCleanup(outputPlugins, cleanCtx, createMockLogger())

  return JSON.stringify({
    deletedFiles: result.deletedFiles,
    deletedDirs: result.deletedDirs,
    errors: result.errors.map(error => ({
      path: error.path,
      kind: error.type,
      error: error.error instanceof Error ? error.error.message : String(error.error)
    })),
    violations: result.violations,
    conflicts: result.conflicts,
    filesToDelete: [],
    dirsToDelete: [],
    emptyDirsToDelete: [],
    excludedScanGlobs: []
  })
}

function resolveEffectiveIncludeSeries(topLevel?: readonly string[], typeSpecific?: readonly string[]): string[] {
  if (topLevel == null && typeSpecific == null) return []
  return [...new Set([...topLevel ?? [], ...typeSpecific ?? []])]
}

function matchesSeries(seriName: string | readonly string[] | null | undefined, effectiveIncludeSeries: readonly string[]): boolean {
  if (seriName == null) return true
  if (effectiveIncludeSeries.length === 0) return true
  if (typeof seriName === 'string') return effectiveIncludeSeries.includes(seriName)
  return seriName.some(name => effectiveIncludeSeries.includes(name))
}

function resolveSubSeries(
  topLevel?: Readonly<Record<string, readonly string[]>>,
  typeSpecific?: Readonly<Record<string, readonly string[]>>
): Record<string, string[]> {
  if (topLevel == null && typeSpecific == null) return {}
  const merged: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(topLevel ?? {})) merged[key] = [...values]
  for (const [key, values] of Object.entries(typeSpecific ?? {})) {
    const existingValues = merged[key] ?? []
    merged[key] = Object.hasOwn(merged, key) ? [...new Set([...existingValues, ...values])] : [...values]
  }
  return merged
}

async function performSkillDistCleanup(distSkillsDir: string, dryRun: boolean): Promise<string> {
  if (!fs.existsSync(distSkillsDir)) {
    return JSON.stringify({
      success: true,
      description: 'dist skills directory does not exist, nothing to clean',
      deletedFiles: [],
      deletedDirs: []
    })
  }

  const filesToDelete: string[] = []
  const dirsToDelete: string[] = []

  function hasSourcePromptExtension(fileName: string): boolean {
    return fileName.endsWith('.src.mdx')
  }

  function shouldRetainCompiledSkillFile(fileName: string): boolean {
    return fileName.endsWith('.mdx') && !hasSourcePromptExtension(fileName)
  }

  function collectCleanupPlan(currentDir: string): boolean {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, {withFileTypes: true})
    } catch {
      return false
    }

    let hasRetainedEntries = false
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        const childWillBeEmpty = collectCleanupPlan(entryPath)
        if (childWillBeEmpty) {
          dirsToDelete.push(entryPath)
        } else {
          hasRetainedEntries = true
        }
        continue
      }
      if (!entry.isFile()) {
        hasRetainedEntries = true
        continue
      }
      if (shouldRetainCompiledSkillFile(entry.name)) {
        hasRetainedEntries = true
        continue
      }
      filesToDelete.push(entryPath)
    }
    return !hasRetainedEntries
  }

  const rootWillBeEmpty = collectCleanupPlan(distSkillsDir)
  if (rootWillBeEmpty) dirsToDelete.push(distSkillsDir)

  const compacted = deskPaths.compactDeletionTargets(filesToDelete, dirsToDelete)

  if (dryRun) {
    return JSON.stringify({
      success: true,
      description: `Would delete ${compacted.files.length} files and ${compacted.dirs.length} directories`,
      deletedFiles: compacted.files,
      deletedDirs: compacted.dirs
    })
  }

  const result = await deskPaths.deleteTargets({files: compacted.files, dirs: compacted.dirs})
  const hasErrors = result.fileErrors.length > 0 || result.dirErrors.length > 0

  return JSON.stringify({
    success: !hasErrors,
    description: `Deleted ${result.deletedFiles.length} files and ${result.deletedDirs.length} directories`,
    deletedFiles: result.deletedFiles,
    deletedDirs: result.deletedDirs,
    ...hasErrors ? {error: `${result.fileErrors.length + result.dirErrors.length} errors occurred during cleanup`} : {}
  })
}

function performMdCleanup(dirs: string[], dryRun: boolean): string {
  const modifiedFiles: string[] = []
  const skippedFiles: string[] = []
  const errors: {path: string, error: Error}[] = []

  function cleanMarkdownContent(content: string): string {
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n'
    const lines = content.split(/\r?\n/)
    const trimmedLines = lines.map(line => line.replace(/[ \t]+$/, ''))

    const result: string[] = []
    let consecutiveBlankCount = 0

    for (const line of trimmedLines) {
      if (line === '') {
        consecutiveBlankCount++
        if (consecutiveBlankCount <= 2) result.push(line)
      } else {
        consecutiveBlankCount = 0
        result.push(line)
      }
    }

    return result.join(lineEnding)
  }

  function processMarkdownFile(filePath: string): void {
    try {
      const originalContent = fs.readFileSync(filePath, 'utf8')
      const cleanedContent = cleanMarkdownContent(originalContent)

      if (originalContent === cleanedContent) {
        skippedFiles.push(filePath)
        return
      }

      if (!dryRun) {
        fs.writeFileSync(filePath, cleanedContent, 'utf8')
      }
      modifiedFiles.push(filePath)
    } catch (err) {
      errors.push({path: filePath, error: err as Error})
    }
  }

  function processDirectory(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true})
    } catch (err) {
      errors.push({path: dir, error: err as Error})
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        processDirectory(entryPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        processMarkdownFile(entryPath)
      }
    }
  }

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    processDirectory(dir)
  }

  const hasErrors = errors.length > 0
  return JSON.stringify({
    success: !hasErrors,
    description: dryRun
      ? `Would modify ${modifiedFiles.length} files, skip ${skippedFiles.length} files`
      : `Modified ${modifiedFiles.length} files, skipped ${skippedFiles.length} files`,
    modifiedFiles,
    skippedFiles,
    ...hasErrors ? {error: `${errors.length} errors occurred during cleanup`} : {}
  })
}

function tryLoadRealBinary(): Record<string, unknown> | undefined {
  try {
    const _require = createRequire(import.meta.url)
    return _require('../../cli/npm/linux-x64-gnu/napi-memory-sync-cli.linux-x64-gnu.node') as Record<string, unknown>
  } catch {}
}

const realBinary = tryLoadRealBinary()

const testBinding = {
  getPlatformFixedDir: deskPaths.getPlatformFixedDir,
  ensureDir: deskPaths.ensureDir,
  existsSync: deskPaths.existsSync,
  deletePathSync: deskPaths.deletePathSync,
  writeFileSync: deskPaths.writeFileSync,
  readFileSync: deskPaths.readFileSync,
  deleteFiles: deskPaths.deleteFiles,
  deleteDirectories: deskPaths.deleteDirectories,
  deleteEmptyDirectories: deskPaths.deleteEmptyDirectories,
  deleteTargets: deskPaths.deleteTargets,
  compactDeletionTargets: deskPaths.compactDeletionTargets,
  planWorkspaceEmptyDirectoryCleanup: deskPaths.planWorkspaceEmptyDirectoryCleanup,
  isDirectoryStructureMismatchError: deskPaths.isDirectoryStructureMismatchError,
  findBlockingNonDirectoryPath: deskPaths.findBlockingNonDirectoryPath,
  resolveBlockingFilePath: deskPaths.resolveBlockingFilePath,
  removeBlockingFile: deskPaths.removeBlockingFile,
  planCleanup,
  performCleanup: runCleanup,
  performSkillDistCleanup,
  performMdCleanup,
  collectBaseOutputPlans,
  collectDroidOutputPlan,
  collectGeminiOutputPlan,
  resolveEffectiveIncludeSeries,
  matchesSeries,
  resolveSubSeries,
  resolveGitInfoDir: resolveGitInfoDirFallback,
  findAllGitRepos: findAllGitReposFallback,
  findGitModuleInfoDirs: findGitModuleInfoDirsFallback,
  resolveRuntimeEnvironment: () => JSON.stringify(resolveRuntimeEnvironmentFallback()),
  getEffectiveHomeDir: getEffectiveHomeDirFallback,
  getGlobalConfigPath: getGlobalConfigPathFallback,
  getRequiredGlobalConfigPath: getRequiredGlobalConfigPathFallback,
  isWslRuntime: isWslRuntimeFallback,
  syncWindowsConfigIntoWsl: async (contextJson: string, declarationsJson: string, dryRun: boolean) => {
    const context = JSON.parse(contextJson) as Record<string, unknown>
    const declarations = JSON.parse(declarationsJson) as unknown

    // Create a mock plugin that returns the declarations passed to the native binding
    const mockPlugin = {
      name: 'MockMirrorPlugin',
      declareWslMirrorFiles: async () => declarations
    } as unknown as OutputAdaptor

    // We also need to simulate generated global outputs if they are in the context
    // but the current wsl-mirror-sync-legacy implementation collects them itself
    // if we pass it predeclared outputs.

    const result = await wslMirrorSyncLegacy.syncWindowsConfigIntoWsl([mockPlugin], {
      collectedOutputContext: context,
      dryRun,
      pluginOptions: {
        windows: context['windows'] // ensure windows options are passed
      },
      logger: {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {}
      }
    } as unknown)
    return JSON.stringify(result)
  },
  topologicalSort: (inputJson: string) => {
    const nodes = JSON.parse(inputJson) as {name: string, dependsOn?: readonly string[]}[]
    const sorted = topologicalSortFallback(nodes)
    return JSON.stringify(sorted.map(n => n.name))
  },
  listPrompts: async (optionsJson: string) => JSON.stringify(await listPrompts(optionsJson == null ? {} : (JSON.parse(optionsJson) as ListPromptsOptions))),
  getPrompt: async (promptId: string, optionsJson: string) => {
    const result = await getPrompt(promptId, optionsJson == null ? {} : (JSON.parse(optionsJson) as PromptServiceOptions))
    return JSON.stringify(result)
  },
  upsertPromptSource: async (inputJson: string) => JSON.stringify(await upsertPromptSource(JSON.parse(inputJson) as UpsertPromptSourceInput)),
  writePromptArtifacts: async (inputJson: string) => JSON.stringify(await writePromptArtifacts(JSON.parse(inputJson) as WritePromptArtifactsInput))
}

const rustPreferredMethods = [
  'planCleanup',
  'performCleanup',
  'compactDeletionTargets',
  'deleteFiles',
  'deleteDirectories',
  'deleteEmptyDirectories',
  'deleteTargets',
  'planWorkspaceEmptyDirectoryCleanup',
  'existsSync',
  'ensureDir',
  'deletePathSync',
  'writeFileSync',
  'readFileSync',
  'getPlatformFixedDir',
  'isDirectoryStructureMismatchError',
  'findBlockingNonDirectoryPath',
  'resolveBlockingFilePath',
  'removeBlockingFile'
]

const legacyTsMethods = ['syncWindowsConfigIntoWsl', 'loadConfig']

const realBinaryOverrides: Record<string, unknown> = {}
if (realBinary != null) {
  for (const method of rustPreferredMethods) {
    if (method in realBinary && !legacyTsMethods.includes(method)) {
      realBinaryOverrides[method] = realBinary[method]
    }
  }
}

globalThis.__TNMSC_TEST_NATIVE_BINDING__ = {
  ...realBinary ?? {},
  ...testBinding,
  ...realBinaryOverrides
}
