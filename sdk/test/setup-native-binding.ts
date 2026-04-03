import type {
  ILogger,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputPlugin
} from '../src/plugins/plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {FilePathKind, PluginKind} from '../src/plugins/plugin-core/enums'
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
  const logger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {}
  } satisfies ILogger

  return logger
}

function createSyntheticOutputPlugin(snapshot: NativePluginCleanupSnapshot): OutputPlugin {
  return {
    type: PluginKind.Output,
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
  const cleanupProtectionRules = snapshot.protectedRules.map(rule => ({
    path: rule.path,
    protectionMode: rule.protectionMode,
    reason: rule.reason,
    matcher: rule.matcher ?? 'path'
  }))

  if (snapshot.aindexDir != null) {
    cleanupProtectionRules.push({
      path: snapshot.aindexDir,
      protectionMode: 'direct',
      reason: 'resolved aindex root',
      matcher: 'path'
    })
  }

  return {
    logger: createMockLogger(),
    fs,
    path,
    glob,
    dryRun: false,
    pluginOptions: mergeConfig({
      workspaceDir,
      cleanupProtection: {
        rules: cleanupProtectionRules
      }
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
  const outputPlugins = snapshot.pluginSnapshots.map(createSyntheticOutputPlugin)
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
  const outputPlugins = snapshot.pluginSnapshots.map(createSyntheticOutputPlugin)
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

globalThis.__TNMSC_TEST_NATIVE_BINDING__ = {
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
  planCleanup,
  performCleanup: runCleanup,
  resolveEffectiveIncludeSeries,
  matchesSeries,
  resolveSubSeries
}
