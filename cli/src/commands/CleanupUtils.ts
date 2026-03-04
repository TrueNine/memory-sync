import type {ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputCleanupPathDeclaration, OutputPlugin} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {deleteDirectories as deskDeleteDirectories, deleteFiles as deskDeleteFiles} from '../plugins/desk-paths'
import {
  collectAllPluginOutputs
} from '../plugins/plugin-core'

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  readonly deletedFiles: number
  readonly deletedDirs: number
  readonly errors: readonly CleanupError[]
}

/**
 * Error during cleanup operation
 */
export interface CleanupError {
  readonly path: string
  readonly type: 'file' | 'directory'
  readonly error: unknown
}

interface DirPathLike {
  readonly path: string
  readonly pathKind?: string
  readonly basePath?: string
  readonly getAbsolutePath?: () => string
}

interface CleanupTargetCollections {
  readonly filesToDelete: string[]
  readonly dirsToDelete: string[]
  readonly protectedPaths: string[]
  readonly skippedDangerousPaths: string[]
  readonly excludedScanGlobs: string[]
}

const KNOWN_AINDEX_INPUT_CONFIG_RELATIVE_PATHS = [
  '.editorconfig',
  '.vscode/settings.json',
  '.vscode/extensions.json',
  '.idea/codeStyles/Project.xml',
  '.idea/codeStyles/codeStyleConfig.xml',
  '.idea/.gitignore',
  '.qoderignore',
  '.cursorignore',
  '.warpindexignore',
  '.aiignore',
  '.codeiumignore',
  '.kiroignore',
  '.traeignore'
] as const

const DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.turbo/**',
  '**/.pnpm-store/**',
  '**/.yarn/**',
  '**/.next/**'
] as const

function expandHomePath(rawPath: string): string {
  if (rawPath === '~') return os.homedir()
  if (rawPath.startsWith('~/') || rawPath.startsWith('~\\')) return path.resolve(os.homedir(), rawPath.slice(2))
  return rawPath
}

function normalizeForComparison(rawPath: string): string {
  const expanded = expandHomePath(rawPath)
  const normalized = path.normalize(path.resolve(expanded))
  if (process.platform === 'win32') return normalized.toLowerCase()
  return normalized
}

function buildComparisonKeys(rawPath: string): readonly string[] {
  const keys = new Set<string>()
  const expanded = expandHomePath(rawPath)
  const normalized = normalizeForComparison(expanded)
  keys.add(normalized)

  try {
    if (fs.existsSync(expanded)) {
      const realPath = fs.realpathSync.native(expanded)
      keys.add(normalizeForComparison(realPath))
    }
  }
  catch {}

  return [...keys]
}

function resolveAbsolutePath(rawPath: string): string {
  return path.resolve(expandHomePath(rawPath))
}

function normalizeGlobPattern(pattern: string): string {
  return expandHomePath(pattern).replaceAll('\\', '/')
}

function addPathToMap(target: Map<string, string>, rawPath: string): void {
  const absolute = resolveAbsolutePath(rawPath)
  for (const key of buildComparisonKeys(absolute)) {
    if (!target.has(key)) target.set(key, absolute)
  }
}

function resolveAbsolutePathFromDir(dir: DirPathLike | undefined): string | undefined {
  if (dir == null) return void 0

  if (typeof dir.getAbsolutePath === 'function') {
    try {
      const absolute = dir.getAbsolutePath()
      if (absolute.length > 0) return path.resolve(absolute)
    }
    catch {}
  }

  if (dir.pathKind === 'absolute') return path.resolve(dir.path)
  if (typeof dir.basePath === 'string' && dir.basePath.length > 0) return path.resolve(dir.basePath, dir.path)
  return void 0
}

function collectInputSourcePaths(cleanCtx: OutputCleanContext): Map<string, string> {
  const collected = cleanCtx.collectedOutputContext
  const protectedPathMap = new Map<string, string>()

  const addResolvedPath = (rawPath: string | undefined): void => {
    if (rawPath == null || rawPath.length === 0) return
    addPathToMap(protectedPathMap, rawPath)
  }

  const addPathFromDir = (dir: DirPathLike | undefined): void => {
    const resolved = resolveAbsolutePathFromDir(dir)
    if (resolved == null) return
    addResolvedPath(resolved)
  }

  addPathFromDir(collected.globalMemory?.dir as DirPathLike | undefined)

  for (const command of collected.commands ?? []) addPathFromDir(command.dir as DirPathLike | undefined)
  for (const subAgent of collected.subAgents ?? []) addPathFromDir(subAgent.dir as DirPathLike | undefined)
  for (const rule of collected.rules ?? []) addPathFromDir(rule.dir as DirPathLike | undefined)

  for (const skill of collected.skills ?? []) {
    addPathFromDir(skill.dir as DirPathLike | undefined)
    for (const childDoc of skill.childDocs ?? []) addPathFromDir(childDoc.dir as DirPathLike | undefined)
    for (const resource of skill.resources ?? []) addResolvedPath(resource.sourcePath)
  }

  for (const config of collected.vscodeConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)
  for (const config of collected.jetbrainsConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)
  for (const config of collected.editorConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)

  for (const ignoreFile of collected.aiAgentIgnoreConfigFiles ?? []) addResolvedPath(ignoreFile.sourcePath)
  const {aindexDir} = collected
  if (aindexDir != null) {
    for (const relativePath of KNOWN_AINDEX_INPUT_CONFIG_RELATIVE_PATHS) addResolvedPath(path.join(aindexDir, relativePath))
  }

  return protectedPathMap
}

function resolveXdgConfigHome(homeDir: string): string {
  const xdgConfigHome = process.env['XDG_CONFIG_HOME']
  if (typeof xdgConfigHome === 'string' && xdgConfigHome.trim().length > 0) return xdgConfigHome
  return path.join(homeDir, '.config')
}

function resolveXdgDataHome(homeDir: string): string {
  const xdgDataHome = process.env['XDG_DATA_HOME']
  if (typeof xdgDataHome === 'string' && xdgDataHome.trim().length > 0) return xdgDataHome
  return path.join(homeDir, '.local', 'share')
}

function resolveXdgStateHome(homeDir: string): string {
  const xdgStateHome = process.env['XDG_STATE_HOME']
  if (typeof xdgStateHome === 'string' && xdgStateHome.trim().length > 0) return xdgStateHome
  return path.join(homeDir, '.local', 'state')
}

function resolveXdgCacheHome(homeDir: string): string {
  const xdgCacheHome = process.env['XDG_CACHE_HOME']
  if (typeof xdgCacheHome === 'string' && xdgCacheHome.trim().length > 0) return xdgCacheHome
  return path.join(homeDir, '.cache')
}

function collectAlwaysProtectedExactRoots(): Map<string, string> {
  const protectedRoots = new Map<string, string>()
  const homeDir = os.homedir()

  addPathToMap(protectedRoots, homeDir)
  addPathToMap(protectedRoots, resolveXdgConfigHome(homeDir))
  addPathToMap(protectedRoots, resolveXdgDataHome(homeDir))
  addPathToMap(protectedRoots, resolveXdgStateHome(homeDir))
  addPathToMap(protectedRoots, resolveXdgCacheHome(homeDir))
  addPathToMap(protectedRoots, path.parse(homeDir).root)

  return protectedRoots
}

function stripTrailingSeparator(rawPath: string): string {
  const {root} = path.parse(rawPath)
  if (rawPath === root) return rawPath
  return rawPath.endsWith(path.sep) ? rawPath.slice(0, -1) : rawPath
}

function isSameOrChildPath(candidate: string, parent: string): boolean {
  const normalizedCandidate = stripTrailingSeparator(candidate)
  const normalizedParent = stripTrailingSeparator(parent)
  if (normalizedCandidate === normalizedParent) return true
  return normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`)
}

function conflictsWithSubtreeProtection(
  targetKey: string,
  protectedSubtreeKeys: readonly string[]
): boolean {
  for (const protectedKey of protectedSubtreeKeys) {
    if (isSameOrChildPath(targetKey, protectedKey) || isSameOrChildPath(protectedKey, targetKey)) return true
  }
  return false
}

function expandCleanupGlob(
  pattern: string,
  cleanCtx: OutputCleanContext,
  ignoreGlobs: readonly string[]
): readonly string[] {
  const normalizedPattern = normalizeGlobPattern(pattern)
  return cleanCtx.glob.sync(normalizedPattern, {
    onlyFiles: false,
    dot: true,
    absolute: true,
    followSymbolicLinks: false,
    ignore: [...ignoreGlobs]
  })
}

async function collectPluginCleanupDeclarations(
  plugin: OutputPlugin,
  cleanCtx: OutputCleanContext
): Promise<OutputCleanupDeclarations> {
  if (plugin.declareCleanupPaths == null) return {}
  return plugin.declareCleanupPaths({...cleanCtx, dryRun: true})
}

function shouldSkipByDangerousExactPath(targetPath: string, dangerousExactKeys: Set<string>): boolean {
  const keys = buildComparisonKeys(targetPath)
  for (const key of keys) {
    if (dangerousExactKeys.has(key)) return true
  }
  return false
}

function compactDeletionTargets(
  filesByKey: Map<string, string>,
  dirsByKey: Map<string, string>
): {files: string[], dirs: string[]} {
  const compactedDirs = new Map<string, string>()
  const sortedDirEntries = [...dirsByKey.entries()].sort((a, b) => a[0].length - b[0].length)

  for (const [dirKey, dirPath] of sortedDirEntries) {
    let coveredByParent = false
    for (const existingParentKey of compactedDirs.keys()) {
      if (isSameOrChildPath(dirKey, existingParentKey)) {
        coveredByParent = true
        break
      }
    }
    if (!coveredByParent) compactedDirs.set(dirKey, dirPath)
  }

  const compactedFiles: string[] = []
  for (const [fileKey, filePath] of filesByKey) {
    let coveredByDir = false
    for (const dirKey of compactedDirs.keys()) {
      if (isSameOrChildPath(fileKey, dirKey)) {
        coveredByDir = true
        break
      }
    }
    if (!coveredByDir) compactedFiles.push(filePath)
  }

  compactedFiles.sort((a, b) => a.localeCompare(b))
  const compactedDirPaths = [...compactedDirs.values()].sort((a, b) => a.localeCompare(b))
  return {files: compactedFiles, dirs: compactedDirPaths}
}

/**
 * Collect deletion targets from enabled output plugins.
 */
export async function collectDeletionTargets(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext
): Promise<{
  filesToDelete: string[]
  dirsToDelete: string[]
  protectedFiles: string[]
  skippedDangerousPaths: string[]
  excludedScanGlobs: string[]
}> {
  const deleteFilesByKey = new Map<string, string>()
  const deleteDirsByKey = new Map<string, string>()
  const protectedByKey = collectInputSourcePaths(cleanCtx)
  const dangerousExactByKey = collectAlwaysProtectedExactRoots()
  const skippedProtectedByKey = new Map<string, string>()
  const skippedDangerousByKey = new Map<string, string>()
  const excludeScanGlobSet = new Set<string>(DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS)

  const pluginSnapshots: {
    readonly plugin: OutputPlugin
    readonly cleanup: OutputCleanupDeclarations
  }[] = []

  const addDeletePath = (rawPath: string, kind: 'file' | 'directory'): void => {
    const targetMap = kind === 'directory' ? deleteDirsByKey : deleteFilesByKey
    addPathToMap(targetMap, rawPath)
  }

  const addProtectPath = (rawPath: string): void => addPathToMap(protectedByKey, rawPath)

  for (const plugin of outputPlugins) {
    const declarations = await plugin.declareOutputFiles({...cleanCtx, dryRun: true})
    for (const declaration of declarations) addDeletePath(declaration.path, 'file')

    const cleanupDeclarations = await collectPluginCleanupDeclarations(plugin, cleanCtx)
    for (const ignoreGlob of cleanupDeclarations.excludeScanGlobs ?? []) excludeScanGlobSet.add(normalizeGlobPattern(ignoreGlob))
    pluginSnapshots.push({plugin, cleanup: cleanupDeclarations})
  }

  const excludeScanGlobs = [...excludeScanGlobSet]

  const resolveDeleteGlob = (target: OutputCleanupPathDeclaration): void => {
    for (const matchedPath of expandCleanupGlob(target.path, cleanCtx, excludeScanGlobs)) {
      try {
        const stat = fs.lstatSync(matchedPath)
        if (stat.isDirectory()) addDeletePath(matchedPath, 'directory')
        else addDeletePath(matchedPath, 'file')
      }
      catch {}
    }
  }

  const resolveProtectGlob = (target: OutputCleanupPathDeclaration): void => {
    for (const matchedPath of expandCleanupGlob(target.path, cleanCtx, excludeScanGlobs)) addProtectPath(matchedPath)
  }

  for (const {cleanup} of pluginSnapshots) {
    for (const target of cleanup.protect ?? []) {
      if (target.kind === 'glob') {
        resolveProtectGlob(target)
        continue
      }
      addProtectPath(target.path)
    }

    for (const target of cleanup.delete ?? []) {
      if (target.kind === 'glob') {
        resolveDeleteGlob(target)
        continue
      }
      if (target.kind === 'directory') addDeletePath(target.path, 'directory')
      else addDeletePath(target.path, 'file')
    }
  }

  const dangerousExactKeySet = new Set(dangerousExactByKey.keys())
  const protectedSubtreeKeys = [...protectedByKey.keys()]

  const filterDeleteTargets = (targets: Map<string, string>): Map<string, string> => {
    const filtered = new Map<string, string>()

    for (const [targetKey, targetPath] of targets) {
      if (shouldSkipByDangerousExactPath(targetPath, dangerousExactKeySet)) {
        addPathToMap(skippedDangerousByKey, targetPath)
        continue
      }

      if (conflictsWithSubtreeProtection(targetKey, protectedSubtreeKeys)) {
        addPathToMap(skippedProtectedByKey, targetPath)
        continue
      }

      filtered.set(targetKey, targetPath)
    }

    return filtered
  }

  const filteredFileTargets = filterDeleteTargets(deleteFilesByKey)
  const filteredDirTargets = filterDeleteTargets(deleteDirsByKey)
  const compactedTargets = compactDeletionTargets(filteredFileTargets, filteredDirTargets)

  return {
    filesToDelete: compactedTargets.files,
    dirsToDelete: compactedTargets.dirs,
    protectedFiles: [...skippedProtectedByKey.values()].sort((a, b) => a.localeCompare(b)),
    skippedDangerousPaths: [...skippedDangerousByKey.values()].sort((a, b) => a.localeCompare(b)),
    excludedScanGlobs: [...excludeScanGlobSet].sort((a, b) => a.localeCompare(b))
  }
}

/**
 * Delete files with error handling.
 * Logs warnings for failed deletions and continues with remaining files.
 * Uses deletePathSync from @truenine/desk-paths for cross-platform safe deletion.
 */
export function deleteFiles(files: string[], logger: ILogger): {deleted: number, errors: CleanupError[]} {
  const resolved = files.map(f => path.isAbsolute(f) ? f : path.resolve(f))
  const result = deskDeleteFiles(resolved)

  for (const f of resolved) {
    if (!result.errors.some(e => e.path === f)) logger.debug({action: 'delete', type: 'file', path: f})
  }
  const errors: CleanupError[] = result.errors.map(e => {
    const errorMessage = e.error instanceof Error ? e.error.message : String(e.error)
    logger.warn('failed to delete file', {path: e.path, error: errorMessage})
    return {path: e.path, type: 'file' as const, error: e.error}
  })

  return {deleted: result.deleted, errors}
}

/**
 * Delete directories with error handling.
 * Sorts by length descending to handle nested dirs properly.
 * Logs warnings for failed deletions and continues with remaining directories.
 */
export function deleteDirectories(dirs: string[], logger: ILogger): {deleted: number, errors: CleanupError[]} {
  const resolved = dirs.map(d => path.isAbsolute(d) ? d : path.resolve(d))
  const result = deskDeleteDirectories(resolved)

  for (const d of resolved) {
    if (!result.errors.some(e => e.path === d)) logger.debug({action: 'delete', type: 'directory', path: d})
  }
  const errors: CleanupError[] = result.errors.map(e => {
    const errorMessage = e.error instanceof Error ? e.error.message : String(e.error)
    logger.warn('failed to delete directory', {path: e.path, error: errorMessage})
    return {path: e.path, type: 'directory' as const, error: e.error}
  })

  return {deleted: result.deleted, errors}
}

function logCleanupPlanDiagnostics(
  logger: ILogger,
  targets: CleanupTargetCollections
): void {
  if (targets.protectedPaths.length > 0) {
    logger.info('skipped protected paths during cleanup', {count: targets.protectedPaths.length})
    for (const protectedPath of targets.protectedPaths) logger.debug('protected cleanup path', {path: protectedPath})
  }

  if (targets.skippedDangerousPaths.length > 0) {
    logger.warn('skipped dangerous cleanup paths', {count: targets.skippedDangerousPaths.length})
    for (const dangerousPath of targets.skippedDangerousPaths) logger.warn('dangerous cleanup path skipped', {path: dangerousPath})
  }

  logger.debug('cleanup plan built', {
    filesToDelete: targets.filesToDelete.length,
    dirsToDelete: targets.dirsToDelete.length,
    protectedPaths: targets.protectedPaths.length,
    skippedDangerousPaths: targets.skippedDangerousPaths.length,
    excludedScanGlobs: targets.excludedScanGlobs
  })
}

/**
 * Perform cleanup operation for output plugins.
 * This is the main reusable cleanup function that can be called from both
 * CleanCommand and ExecuteCommand (for pre-cleanup).
 */
export async function performCleanup(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext,
  logger: ILogger
): Promise<CleanupResult> {
  const outputs = await collectAllPluginOutputs(outputPlugins, cleanCtx) // Collect outputs for logging
  logger.debug('Collected outputs for cleanup', {
    projectDirs: outputs.projectDirs.length,
    projectFiles: outputs.projectFiles.length,
    workspaceDirs: outputs.workspaceDirs.length,
    workspaceFiles: outputs.workspaceFiles.length,
    globalDirs: outputs.globalDirs.length,
    globalFiles: outputs.globalFiles.length
  })

  const targets = await collectDeletionTargets(outputPlugins, cleanCtx)
  const cleanupTargets: CleanupTargetCollections = {
    filesToDelete: targets.filesToDelete,
    dirsToDelete: targets.dirsToDelete,
    protectedPaths: targets.protectedFiles,
    skippedDangerousPaths: targets.skippedDangerousPaths,
    excludedScanGlobs: targets.excludedScanGlobs
  }
  logCleanupPlanDiagnostics(logger, cleanupTargets)

  const fileResult = deleteFiles(cleanupTargets.filesToDelete, logger)
  const dirResult = deleteDirectories(cleanupTargets.dirsToDelete, logger)

  return {
    deletedFiles: fileResult.deleted,
    deletedDirs: dirResult.deleted,
    errors: [...fileResult.errors, ...dirResult.errors]
  }
}
