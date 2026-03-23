import type {ILogger, OutputCollectedContext, PluginOptions} from './plugins/plugin-core'
import type {PublicDefinitionResolveOptions} from './public-config-paths'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import glob from 'fast-glob'
import {buildProtectedDeletionDiagnostic} from './diagnostics'
import {collectKnownPublicConfigDefinitionPaths} from './public-config-paths'
import {getEffectiveHomeDir, resolveUserPath} from './runtime-environment'

interface DirPathLike {
  readonly path: string
  readonly pathKind?: string
  readonly basePath?: string
  readonly getAbsolutePath?: () => string
}

export type ProtectionMode = 'direct' | 'recursive'
export type ProtectionRuleMatcher = 'path' | 'glob'

export interface ProtectedPathRule {
  readonly path: string
  readonly protectionMode: ProtectionMode
  readonly reason: string
  readonly source: string
  readonly matcher?: ProtectionRuleMatcher
}

interface CompiledProtectedPathRule extends ProtectedPathRule {
  readonly comparisonKeys: readonly string[]
  readonly normalizedPath: string
  readonly specificity: number
}

export interface ProtectedPathViolation {
  readonly targetPath: string
  readonly protectedPath: string
  readonly protectionMode: ProtectionMode
  readonly reason: string
  readonly source: string
}

export interface ProtectedDeletionGuard {
  readonly rules: readonly ProtectedPathRule[]
  readonly exactProtectedPaths: readonly string[]
  readonly subtreeProtectedPaths: readonly string[]
  readonly compiledRules: readonly CompiledProtectedPathRule[]
}

export interface ProtectedDeletionGuardOptions {
  readonly workspaceDir?: string
  readonly aindexDir?: string
  readonly projectRoots?: readonly string[]
  readonly exactProtectedPaths?: readonly string[]
  readonly subtreeProtectedPaths?: readonly string[]
  readonly rules?: readonly ProtectedPathRule[]
  readonly includeReservedWorkspaceContentRoots?: boolean
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

const CONFIGURED_AINDEX_DIRECTORY_KEYS = [
  'skills',
  'commands',
  'subAgents',
  'rules',
  'app',
  'ext',
  'arch'
] as const satisfies readonly (keyof Required<PluginOptions>['aindex'])[]

const CONFIGURED_AINDEX_FILE_KEYS = [
  'globalPrompt',
  'workspacePrompt'
] as const satisfies readonly (keyof Required<PluginOptions>['aindex'])[]

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
  if (rawPath === '~' || rawPath.startsWith('~/') || rawPath.startsWith('~\\')) return resolveUserPath(rawPath)
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

function createProtectedPathRule(
  rawPath: string,
  protectionMode: ProtectionMode,
  reason: string,
  source: string,
  matcher: ProtectionRuleMatcher = 'path'
): ProtectedPathRule {
  return {
    path: resolveAbsolutePath(rawPath),
    protectionMode,
    reason,
    source,
    matcher
  }
}

function compileRule(rule: ProtectedPathRule): CompiledProtectedPathRule {
  const normalizedPath = normalizeForComparison(rule.path)
  return {
    ...rule,
    path: resolveAbsolutePath(rule.path),
    comparisonKeys: buildComparisonKeys(rule.path),
    normalizedPath,
    specificity: stripTrailingSeparator(normalizedPath).length
  }
}

function dedupeAndCompileRules(rules: readonly ProtectedPathRule[]): CompiledProtectedPathRule[] {
  const compiledByKey = new Map<string, CompiledProtectedPathRule>()

  for (const rule of rules) {
    const compiled = compileRule(rule)
    compiledByKey.set(`${compiled.protectionMode}:${compiled.normalizedPath}`, compiled)
  }

  return [...compiledByKey.values()].sort((a, b) => {
    const specificityDiff = b.specificity - a.specificity
    if (specificityDiff !== 0) return specificityDiff

    if (a.protectionMode !== b.protectionMode) return a.protectionMode === 'recursive' ? -1 : 1
    return a.path.localeCompare(b.path)
  })
}

function normalizeGlobPattern(pattern: string): string {
  return resolveAbsolutePath(pattern).replaceAll('\\', '/')
}

function expandProtectedPathRules(rules: readonly ProtectedPathRule[]): ProtectedPathRule[] {
  const expandedRules: ProtectedPathRule[] = []

  for (const rule of rules) {
    if (rule.matcher !== 'glob') {
      expandedRules.push(createProtectedPathRule(rule.path, rule.protectionMode, rule.reason, rule.source))
      continue
    }

    const matchedPaths = glob.sync(normalizeGlobPattern(rule.path), {
      onlyFiles: false,
      dot: true,
      absolute: true,
      followSymbolicLinks: false
    })

    for (const matchedPath of matchedPaths) expandedRules.push(createProtectedPathRule(matchedPath, rule.protectionMode, rule.reason, rule.source))
  }

  return expandedRules
}

function isRuleMatch(targetKey: string, ruleKey: string, protectionMode: ProtectionMode): boolean {
  if (protectionMode === 'direct') return isSameOrChildPath(ruleKey, targetKey)
  return isSameOrChildPath(targetKey, ruleKey) || isSameOrChildPath(ruleKey, targetKey)
}

function detectPathProtectionMode(rawPath: string, fallback: ProtectionMode): ProtectionMode {
  const absolutePath = resolveAbsolutePath(rawPath)

  try {
    if (fs.existsSync(absolutePath) && fs.lstatSync(absolutePath).isDirectory()) return 'recursive'
  }
  catch {}

  return fallback
}

function collectBuiltInDangerousPathRules(): ProtectedPathRule[] {
  const homeDir = getEffectiveHomeDir()

  return [
    createProtectedPathRule(path.parse(homeDir).root, 'direct', 'built-in dangerous root path', 'built-in-dangerous-root'),
    createProtectedPathRule(homeDir, 'direct', 'built-in dangerous home directory', 'built-in-dangerous-root'),
    createProtectedPathRule(resolveXdgConfigHome(homeDir), 'direct', 'built-in dangerous config directory', 'built-in-dangerous-root'),
    createProtectedPathRule(resolveXdgDataHome(homeDir), 'direct', 'built-in dangerous data directory', 'built-in-dangerous-root'),
    createProtectedPathRule(resolveXdgStateHome(homeDir), 'direct', 'built-in dangerous state directory', 'built-in-dangerous-root'),
    createProtectedPathRule(resolveXdgCacheHome(homeDir), 'direct', 'built-in dangerous cache directory', 'built-in-dangerous-root'),
    createProtectedPathRule(path.join(homeDir, '.aindex'), 'direct', 'built-in global aindex directory', 'built-in-dangerous-root'),
    createProtectedPathRule(path.join(homeDir, '.aindex', '.tnmsc.json'), 'direct', 'built-in global config file', 'built-in-config')
  ]
}

function collectWorkspaceReservedRules(
  workspaceDir: string,
  projectRoots: readonly string[],
  includeReservedWorkspaceContentRoots: boolean
): ProtectedPathRule[] {
  const rules: ProtectedPathRule[] = [
    createProtectedPathRule(workspaceDir, 'direct', 'workspace root', 'workspace-reserved'),
    createProtectedPathRule(path.join(workspaceDir, 'aindex'), 'direct', 'reserved workspace aindex root', 'workspace-reserved'),
    createProtectedPathRule(path.join(workspaceDir, 'knowladge'), 'direct', 'reserved workspace knowladge root', 'workspace-reserved')
  ]

  for (const projectRoot of projectRoots) rules.push(createProtectedPathRule(projectRoot, 'direct', 'workspace project root', 'workspace-project-root'))

  if (includeReservedWorkspaceContentRoots) {
    rules.push(
      createProtectedPathRule(
        path.join(workspaceDir, 'aindex', 'dist', '**', '*.mdx'),
        'direct',
        'reserved workspace aindex dist mdx files',
        'workspace-reserved',
        'glob'
      ),
      createProtectedPathRule(
        path.join(workspaceDir, 'aindex', 'app', '**', '*.mdx'),
        'direct',
        'reserved workspace aindex app mdx files',
        'workspace-reserved',
        'glob'
      )
    )
  }

  return rules
}

function collectResolvedAindexRules(aindexDir: string): ProtectedPathRule[] {
  return [createProtectedPathRule(aindexDir, 'direct', 'resolved aindex root', 'aindex-root')]
}

export function collectKnownAindexInputConfigPaths(
  aindexDir: string,
  resolveOptions?: PublicDefinitionResolveOptions
): string[] {
  return collectKnownPublicConfigDefinitionPaths(aindexDir, resolveOptions)
}

export function collectConfiguredAindexInputRules(
  pluginOptions: Required<PluginOptions>,
  aindexDir: string,
  resolveOptions?: PublicDefinitionResolveOptions
): ProtectedPathRule[] {
  const rules: ProtectedPathRule[] = []

  for (const key of CONFIGURED_AINDEX_DIRECTORY_KEYS) {
    rules.push(
      createProtectedPathRule(
        path.join(aindexDir, pluginOptions.aindex[key].src),
        'recursive',
        `configured aindex ${key} source directory`,
        'configured-aindex-source'
      )
    )
  }

  for (const key of CONFIGURED_AINDEX_FILE_KEYS) {
    rules.push(
      createProtectedPathRule(
        path.join(aindexDir, pluginOptions.aindex[key].src),
        'direct',
        `configured aindex ${key} source file`,
        'configured-aindex-source'
      )
    )
  }

  for (const protectedPath of collectKnownAindexInputConfigPaths(aindexDir, resolveOptions)) {
    rules.push(
      createProtectedPathRule(
        protectedPath,
        'direct',
        'known aindex input config file',
        'known-aindex-config'
      )
    )
  }

  return rules
}

export function collectConfiguredAindexInputPaths(
  pluginOptions: Required<PluginOptions>,
  aindexDir: string,
  resolveOptions?: PublicDefinitionResolveOptions
): string[] {
  return collectConfiguredAindexInputRules(pluginOptions, aindexDir, resolveOptions).map(rule => rule.path)
}

export function collectProtectedInputSourceRules(
  collectedOutputContext: OutputCollectedContext
): ProtectedPathRule[] {
  const rules: ProtectedPathRule[] = []
  const seen = new Set<string>()

  const addRule = (
    rawPath: string | undefined,
    protectionMode: ProtectionMode,
    reason: string,
    source: string
  ): void => {
    if (rawPath == null || rawPath.length === 0) return

    const rule = createProtectedPathRule(rawPath, protectionMode, reason, source)
    const dedupeKey = `${rule.protectionMode}:${normalizeForComparison(rule.path)}`
    if (seen.has(dedupeKey)) return

    seen.add(dedupeKey)
    rules.push(rule)
  }

  const addRuleFromDir = (
    dir: DirPathLike | undefined,
    protectionMode: ProtectionMode,
    reason: string,
    source: string
  ): void => {
    const resolved = resolveAbsolutePathFromDir(dir)
    if (resolved == null) return
    addRule(resolved, protectionMode, reason, source)
  }

  addRuleFromDir(collectedOutputContext.globalMemory?.dir as DirPathLike | undefined, 'recursive', 'global memory source directory', 'collected-input-source')

  for (const command of collectedOutputContext.commands ?? []) {
    addRuleFromDir(command.dir as DirPathLike | undefined, 'recursive', 'command source directory', 'collected-input-source')
  }

  for (const subAgent of collectedOutputContext.subAgents ?? []) {
    addRuleFromDir(subAgent.dir as DirPathLike | undefined, 'recursive', 'sub-agent source directory', 'collected-input-source')
  }

  for (const rule of collectedOutputContext.rules ?? []) {
    addRuleFromDir(rule.dir as DirPathLike | undefined, 'recursive', 'rule source directory', 'collected-input-source')
  }

  for (const skill of collectedOutputContext.skills ?? []) {
    addRuleFromDir(skill.dir as DirPathLike | undefined, 'recursive', 'skill source directory', 'collected-input-source')
    for (const childDoc of skill.childDocs ?? []) {
      addRuleFromDir(childDoc.dir as DirPathLike | undefined, 'recursive', 'skill child document directory', 'collected-input-source')
    }
    for (const resource of skill.resources ?? []) {
      if (resource.sourcePath == null || resource.sourcePath.length === 0) continue
      addRule(
        resource.sourcePath,
        detectPathProtectionMode(resource.sourcePath, 'direct'),
        'skill resource source path',
        'collected-input-source'
      )
    }
  }

  for (const config of collectedOutputContext.vscodeConfigFiles ?? []) {
    addRuleFromDir(config.dir as DirPathLike | undefined, 'direct', 'vscode input config file', 'collected-input-config')
  }

  for (const config of collectedOutputContext.jetbrainsConfigFiles ?? []) {
    addRuleFromDir(config.dir as DirPathLike | undefined, 'direct', 'jetbrains input config file', 'collected-input-config')
  }

  for (const config of collectedOutputContext.editorConfigFiles ?? []) {
    addRuleFromDir(config.dir as DirPathLike | undefined, 'direct', 'editorconfig input file', 'collected-input-config')
  }

  for (const ignoreFile of collectedOutputContext.aiAgentIgnoreConfigFiles ?? []) {
    addRule(ignoreFile.sourcePath, 'direct', 'AI agent ignore config file', 'collected-input-config')
  }

  if (collectedOutputContext.aindexDir != null) {
    for (const protectedPath of collectKnownAindexInputConfigPaths(collectedOutputContext.aindexDir, {
      workspaceDir: collectedOutputContext.workspace.directory.path
    })) {
      addRule(protectedPath, 'direct', 'known aindex input config file', 'known-aindex-config')
    }
  }

  return rules
}

export function collectProtectedInputSourcePaths(collectedOutputContext: OutputCollectedContext): string[] {
  return collectProtectedInputSourceRules(collectedOutputContext).map(rule => rule.path)
}

function collectLegacyCompatibilityRules(options: ProtectedDeletionGuardOptions): ProtectedPathRule[] {
  const rules: ProtectedPathRule[] = []

  for (const protectedPath of options.exactProtectedPaths ?? []) {
    rules.push(createProtectedPathRule(protectedPath, 'direct', 'legacy direct protected path', 'legacy-direct'))
  }

  for (const protectedPath of options.subtreeProtectedPaths ?? []) {
    rules.push(createProtectedPathRule(protectedPath, 'recursive', 'legacy recursive protected path', 'legacy-recursive'))
  }

  return rules
}

export function createProtectedDeletionGuard(
  options: ProtectedDeletionGuardOptions = {}
): ProtectedDeletionGuard {
  const includeReservedWorkspaceContentRoots = options.includeReservedWorkspaceContentRoots ?? true
  const rules: ProtectedPathRule[] = [
    ...collectBuiltInDangerousPathRules(),
    ...collectLegacyCompatibilityRules(options),
    ...options.workspaceDir != null
      ? collectWorkspaceReservedRules(
          options.workspaceDir,
          options.projectRoots ?? [],
          includeReservedWorkspaceContentRoots
        )
      : [],
    ...options.aindexDir != null ? collectResolvedAindexRules(options.aindexDir) : [],
    ...options.rules ?? []
  ]
  const compiledRules = dedupeAndCompileRules(expandProtectedPathRules(rules))

  return {
    rules: compiledRules.map(rule => ({
      path: rule.path,
      protectionMode: rule.protectionMode,
      reason: rule.reason,
      source: rule.source,
      ...rule.matcher != null ? {matcher: rule.matcher} : {}
    })),
    exactProtectedPaths: compiledRules
      .filter(rule => rule.protectionMode === 'direct')
      .map(rule => rule.path),
    subtreeProtectedPaths: compiledRules
      .filter(rule => rule.protectionMode === 'recursive')
      .map(rule => rule.path),
    compiledRules
  }
}

export function collectProjectRoots(collectedOutputContext: OutputCollectedContext): string[] {
  const projectRoots = new Set<string>()

  for (const project of collectedOutputContext.workspace.projects) {
    if (project.isWorkspaceRootProject === true) continue
    const absolutePath = project.dirFromWorkspacePath?.getAbsolutePath?.()
    if (absolutePath != null && absolutePath.length > 0) projectRoots.add(resolveAbsolutePath(absolutePath))
  }

  return [...projectRoots]
}

function selectMoreSpecificRule(
  candidate: CompiledProtectedPathRule,
  current: CompiledProtectedPathRule | undefined
): CompiledProtectedPathRule {
  if (current == null) return candidate
  if (candidate.specificity !== current.specificity) return candidate.specificity > current.specificity ? candidate : current
  if (candidate.protectionMode !== current.protectionMode) return candidate.protectionMode === 'recursive' ? candidate : current
  return candidate.path.localeCompare(current.path) < 0 ? candidate : current
}

export function getProtectedPathViolation(
  targetPath: string,
  guard: ProtectedDeletionGuard
): ProtectedPathViolation | undefined {
  const absoluteTargetPath = resolveAbsolutePath(targetPath)
  const targetKeys = buildComparisonKeys(absoluteTargetPath)
  let matchedRule: CompiledProtectedPathRule | undefined

  for (const rule of guard.compiledRules) {
    let didMatch = false

    for (const targetKey of targetKeys) {
      for (const ruleKey of rule.comparisonKeys) {
        if (!isRuleMatch(targetKey, ruleKey, rule.protectionMode)) continue
        matchedRule = selectMoreSpecificRule(rule, matchedRule)
        didMatch = true
        break
      }

      if (didMatch) break
    }
  }

  if (matchedRule == null) return void 0

  return {
    targetPath: absoluteTargetPath,
    protectedPath: matchedRule.path,
    protectionMode: matchedRule.protectionMode,
    reason: matchedRule.reason,
    source: matchedRule.source
  }
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

    if (!violationsByTargetPath.has(violation.targetPath)) violationsByTargetPath.set(violation.targetPath, violation)
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
  logger: ILogger,
  operation: string,
  violations: readonly ProtectedPathViolation[]
): void {
  logger.error(buildProtectedDeletionDiagnostic(operation, violations))
}
