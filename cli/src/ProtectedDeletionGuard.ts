import type {OutputCollectedContext, PluginOptions} from './plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'

interface DirPathLike {
  readonly path: string
  readonly pathKind?: string
  readonly basePath?: string
  readonly getAbsolutePath?: () => string
}

interface ProtectedPathEntry {
  readonly path: string
  readonly reason: string
}

export interface ProtectedPathViolation {
  readonly targetPath: string
  readonly protectedPath: string
  readonly protection: 'exact' | 'subtree'
  readonly reason: string
}

export interface ProtectedDeletionGuard {
  readonly exactProtectedPaths: readonly string[]
  readonly subtreeProtectedPaths: readonly string[]
  readonly exactByKey: ReadonlyMap<string, ProtectedPathEntry>
  readonly subtreeByKey: ReadonlyMap<string, ProtectedPathEntry>
}

export interface ProtectedDeletionGuardOptions {
  readonly workspaceDir?: string
  readonly aindexDir?: string
  readonly projectRoots?: readonly string[]
  readonly exactProtectedPaths?: readonly string[]
  readonly subtreeProtectedPaths?: readonly string[]
}

export class ProtectedDeletionGuardError extends Error {
  readonly operation: string

  readonly violations: readonly ProtectedPathViolation[]

  constructor(operation: string, violations: readonly ProtectedPathViolation[]) {
    super(buildProtectedDeletionGuardMessage(operation, violations))
    this.name = 'ProtectedDeletionGuardError'
    this.operation = operation
    this.violations = violations
  }
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

export function expandHomePath(rawPath: string): string {
  if (rawPath === '~') return os.homedir()
  if (rawPath.startsWith('~/') || rawPath.startsWith('~\\')) return path.resolve(os.homedir(), rawPath.slice(2))
  return rawPath
}

export function resolveAbsolutePath(rawPath: string): string {
  return path.resolve(expandHomePath(rawPath))
}

function normalizeForComparison(rawPath: string): string {
  const normalized = path.normalize(resolveAbsolutePath(rawPath))
  if (process.platform === 'win32') return normalized.toLowerCase()
  return normalized
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

export function buildComparisonKeys(rawPath: string): readonly string[] {
  const absolute = resolveAbsolutePath(rawPath)
  const keys = new Set<string>([normalizeForComparison(absolute)])

  try {
    if (fs.existsSync(absolute)) {
      const realPath = fs.realpathSync.native(absolute)
      keys.add(normalizeForComparison(realPath))
    }
  }
  catch {}

  return [...keys]
}

function addProtectedPath(
  target: Map<string, ProtectedPathEntry>,
  rawPath: string,
  reason: string
): void {
  const absolutePath = resolveAbsolutePath(rawPath)
  for (const comparisonKey of buildComparisonKeys(absolutePath)) {
    if (!target.has(comparisonKey)) {
      target.set(comparisonKey, {
        path: absolutePath,
        reason
      })
    }
  }
}

function collectBuiltInExactProtectedPaths(): readonly string[] {
  const homeDir = os.homedir()
  return [
    path.parse(homeDir).root,
    homeDir,
    resolveXdgConfigHome(homeDir),
    resolveXdgDataHome(homeDir),
    resolveXdgStateHome(homeDir),
    resolveXdgCacheHome(homeDir),
    path.join(homeDir, '.aindex'),
    path.join(homeDir, '.aindex', '.tnmsc.json')
  ]
}

export function collectKnownAindexInputConfigPaths(aindexDir: string): string[] {
  return KNOWN_AINDEX_INPUT_CONFIG_RELATIVE_PATHS.map(relativePath => path.join(aindexDir, relativePath))
}

export function collectConfiguredAindexInputPaths(
  options: Required<PluginOptions>,
  aindexDir: string
): string[] {
  const configuredPaths = [
    options.aindex.skills.src,
    options.aindex.commands.src,
    options.aindex.subAgents.src,
    options.aindex.rules.src,
    options.aindex.globalPrompt.src,
    options.aindex.workspacePrompt.src,
    options.aindex.app.src,
    options.aindex.ext.src,
    options.aindex.arch.src
  ].map(relativePath => path.join(aindexDir, relativePath))

  return [
    ...configuredPaths,
    ...collectKnownAindexInputConfigPaths(aindexDir)
  ]
}

export function collectProtectedInputSourcePaths(collectedOutputContext: OutputCollectedContext): string[] {
  const protectedPaths = new Set<string>()

  const addResolvedPath = (rawPath: string | undefined): void => {
    if (rawPath == null || rawPath.length === 0) return
    protectedPaths.add(resolveAbsolutePath(rawPath))
  }

  const addPathFromDir = (dir: DirPathLike | undefined): void => {
    const resolved = resolveAbsolutePathFromDir(dir)
    if (resolved == null) return
    addResolvedPath(resolved)
  }

  addPathFromDir(collectedOutputContext.globalMemory?.dir as DirPathLike | undefined)

  for (const command of collectedOutputContext.commands ?? []) addPathFromDir(command.dir as DirPathLike | undefined)
  for (const subAgent of collectedOutputContext.subAgents ?? []) addPathFromDir(subAgent.dir as DirPathLike | undefined)
  for (const rule of collectedOutputContext.rules ?? []) addPathFromDir(rule.dir as DirPathLike | undefined)

  for (const skill of collectedOutputContext.skills ?? []) {
    addPathFromDir(skill.dir as DirPathLike | undefined)
    for (const childDoc of skill.childDocs ?? []) addPathFromDir(childDoc.dir as DirPathLike | undefined)
    for (const resource of skill.resources ?? []) addResolvedPath(resource.sourcePath)
  }

  for (const config of collectedOutputContext.vscodeConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)
  for (const config of collectedOutputContext.jetbrainsConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)
  for (const config of collectedOutputContext.editorConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)

  for (const ignoreFile of collectedOutputContext.aiAgentIgnoreConfigFiles ?? []) addResolvedPath(ignoreFile.sourcePath)

  if (collectedOutputContext.aindexDir != null) {
    for (const protectedPath of collectKnownAindexInputConfigPaths(collectedOutputContext.aindexDir)) addResolvedPath(protectedPath)
  }

  return [...protectedPaths]
}

export function createProtectedDeletionGuard(
  options: ProtectedDeletionGuardOptions = {}
): ProtectedDeletionGuard {
  const exactByKey = new Map<string, ProtectedPathEntry>()
  const subtreeByKey = new Map<string, ProtectedPathEntry>()

  for (const protectedPath of collectBuiltInExactProtectedPaths()) {
    addProtectedPath(exactByKey, protectedPath, 'built-in exact protected path')
  }

  for (const protectedPath of options.exactProtectedPaths ?? []) {
    addProtectedPath(exactByKey, protectedPath, 'custom exact protected path')
  }

  if (options.workspaceDir != null) addProtectedPath(exactByKey, options.workspaceDir, 'workspace root')
  if (options.aindexDir != null) addProtectedPath(exactByKey, options.aindexDir, 'aindex root')
  for (const projectRoot of options.projectRoots ?? []) addProtectedPath(exactByKey, projectRoot, 'workspace project root')

  for (const protectedPath of options.subtreeProtectedPaths ?? []) {
    addProtectedPath(subtreeByKey, protectedPath, 'protected input/source path')
  }

  return {
    exactProtectedPaths: [...new Set([...exactByKey.values()].map(entry => entry.path))].sort((a, b) => a.localeCompare(b)),
    subtreeProtectedPaths: [...new Set([...subtreeByKey.values()].map(entry => entry.path))].sort((a, b) => a.localeCompare(b)),
    exactByKey,
    subtreeByKey
  }
}

export function collectProjectRoots(collectedOutputContext: OutputCollectedContext): string[] {
  const projectRoots = new Set<string>()

  for (const project of collectedOutputContext.workspace.projects) {
    const absolutePath = project.dirFromWorkspacePath?.getAbsolutePath?.()
    if (absolutePath != null && absolutePath.length > 0) projectRoots.add(resolveAbsolutePath(absolutePath))
  }

  return [...projectRoots]
}

export function getProtectedPathViolation(
  targetPath: string,
  guard: ProtectedDeletionGuard
): ProtectedPathViolation | undefined {
  const absoluteTargetPath = resolveAbsolutePath(targetPath)
  const targetKeys = buildComparisonKeys(absoluteTargetPath)

  for (const comparisonKey of targetKeys) {
    const exactMatch = guard.exactByKey.get(comparisonKey)
    if (exactMatch != null) {
      return {
        targetPath: absoluteTargetPath,
        protectedPath: exactMatch.path,
        protection: 'exact',
        reason: exactMatch.reason
      }
    }
  }

  for (const comparisonKey of targetKeys) {
    for (const [protectedKey, protectedEntry] of guard.subtreeByKey.entries()) {
      if (isSameOrChildPath(comparisonKey, protectedKey) || isSameOrChildPath(protectedKey, comparisonKey)) {
        return {
          targetPath: absoluteTargetPath,
          protectedPath: protectedEntry.path,
          protection: 'subtree',
          reason: protectedEntry.reason
        }
      }
    }
  }

  return void 0
}

export function partitionDeletionTargets(
  targetPaths: readonly string[],
  guard: ProtectedDeletionGuard
): {safePaths: string[], violations: ProtectedPathViolation[]} {
  const safePaths: string[] = []
  const violationsByTargetPath = new Map<string, ProtectedPathViolation>()

  for (const targetPath of targetPaths) {
    const absoluteTargetPath = resolveAbsolutePath(targetPath)
    const violation = getProtectedPathViolation(absoluteTargetPath, guard)
    if (violation == null) {
      safePaths.push(absoluteTargetPath)
      continue
    }

    if (!violationsByTargetPath.has(violation.targetPath)) {
      violationsByTargetPath.set(violation.targetPath, violation)
    }
  }

  return {
    safePaths,
    violations: [...violationsByTargetPath.values()].sort((a, b) => a.targetPath.localeCompare(b.targetPath))
  }
}

export function buildProtectedDeletionGuardMessage(
  operation: string,
  violations: readonly ProtectedPathViolation[]
): string {
  const pathList = violations.map(violation => violation.targetPath).join(', ')
  return `Protected deletion guard blocked ${operation} for ${violations.length} path(s): ${pathList}`
}

export function logProtectedDeletionGuardError(
  logger: {error: (message: string, meta?: object) => void},
  operation: string,
  violations: readonly ProtectedPathViolation[]
): void {
  logger.error('protected deletion guard triggered', {
    operation,
    count: violations.length,
    violations: violations.map(violation => ({
      targetPath: violation.targetPath,
      protectedPath: violation.protectedPath,
      protection: violation.protection,
      reason: violation.reason
    }))
  })
}
