import type {PluginOptions, YAMLFrontMatter} from '@/plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import glob from 'fast-glob'
import {mergeConfig, userConfigToPluginOptions} from './config'
import {getConfigLoader} from './ConfigLoader'
import {PathPlaceholders} from './plugins/plugin-core'

export type ManagedPromptKind
  = | 'global-memory'
    | 'workspace-memory'
    | 'project-memory'
    | 'project-child-memory'
    | 'skill'
    | 'skill-child-doc'
    | 'command'
    | 'subagent'
    | 'rule'

export type PromptArtifactState = 'missing' | 'stale' | 'ready'
export type PromptSourceLocale = 'zh' | 'en'

export interface PromptServiceOptions {
  readonly cwd?: string
  readonly loadUserConfig?: boolean
  readonly pluginOptions?: Partial<PluginOptions>
}

export interface ListPromptsOptions extends PromptServiceOptions {
  readonly kinds?: readonly ManagedPromptKind[]
  readonly query?: string
  readonly enStatus?: readonly PromptArtifactState[]
  readonly distStatus?: readonly PromptArtifactState[]
}

export interface PromptArtifactRecord {
  readonly path: string
  readonly exists: true
  readonly mtime: string
  readonly mtimeMs: number
  readonly size: number
  readonly legacySource?: true
  readonly frontMatter?: YAMLFrontMatter
  readonly content?: string
}

export interface PromptCatalogPaths {
  readonly zh: string
  readonly en: string
  readonly dist: string
}

export interface PromptCatalogPresence {
  readonly zh: boolean
  readonly en: boolean
  readonly dist: boolean
}

export interface PromptCatalogItem {
  readonly promptId: string
  readonly kind: ManagedPromptKind
  readonly logicalName: string
  readonly paths: PromptCatalogPaths
  readonly exists: PromptCatalogPresence
  readonly enStatus: PromptArtifactState
  readonly distStatus: PromptArtifactState
  readonly updatedAt?: string
  readonly legacyZhSource?: true
}

export interface PromptDetails extends PromptCatalogItem {
  readonly src: {
    readonly zh?: PromptArtifactRecord
    readonly en?: PromptArtifactRecord
  }
  readonly dist?: PromptArtifactRecord
  readonly frontMatter?: YAMLFrontMatter
}

export interface UpsertPromptSourceInput extends PromptServiceOptions {
  readonly promptId: string
  readonly locale?: PromptSourceLocale
  readonly content: string
}

export interface WritePromptArtifactsInput extends PromptServiceOptions {
  readonly promptId: string
  readonly enContent?: string
  readonly distContent?: string
}

interface ResolvedPromptEnvironment {
  readonly options: Required<PluginOptions>
  readonly workspaceDir: string
  readonly aindexDir: string
}

interface PromptDefinition {
  readonly promptId: string
  readonly kind: ManagedPromptKind
  readonly logicalName: string
  readonly paths: PromptCatalogPaths
  readonly legacyZhPath?: string
}

interface PromptIdDescriptor {
  readonly kind: ManagedPromptKind
  readonly projectName?: string
  readonly relativeName?: string
  readonly skillName?: string
}

const SOURCE_PROMPT_EXTENSION = '.src.mdx'
const MDX_EXTENSION = '.mdx'
const PROJECT_MEMORY_FILE_NAME = 'agt'
const SKILL_ENTRY_FILE_NAME = 'skill'
const LEGACY_PROJECT_MEMORY_KINDS = new Set<ManagedPromptKind>([
  'project-memory',
  'project-child-memory'
])

function normalizeSlashPath(value: string): string {
  return value.replaceAll('\\', '/')
}

function normalizeRelativeIdentifier(value: string, fieldName: string): string {
  const normalized = normalizeSlashPath(value).trim()
  if (normalized.length === 0) throw new Error(`${fieldName} cannot be empty`)

  const segments = normalized.split('/')
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..') throw new Error(`${fieldName} contains an invalid path segment`)
  }

  return segments.join('/')
}

function isSingleSegmentIdentifier(value: string): boolean {
  return !normalizeSlashPath(value).includes('/')
}

function resolveConfiguredPath(rawPath: string, workspaceDir: string): string {
  let resolved = rawPath

  if (resolved.startsWith(PathPlaceholders.USER_HOME)) resolved = resolved.replace(PathPlaceholders.USER_HOME, os.homedir())

  if (resolved.includes(PathPlaceholders.WORKSPACE)) resolved = resolved.replace(PathPlaceholders.WORKSPACE, workspaceDir)

  return path.normalize(resolved)
}

function resolvePromptEnvironment(options: PromptServiceOptions = {}): ResolvedPromptEnvironment {
  const {cwd, loadUserConfig = true, pluginOptions = {}} = options
  let userConfigOptions: Partial<PluginOptions> = {}

  if (loadUserConfig) {
    const userConfigResult = getConfigLoader().load(cwd)
    if (userConfigResult.found) userConfigOptions = userConfigToPluginOptions(userConfigResult.config)
  }

  const mergedOptions = mergeConfig(userConfigOptions, pluginOptions)
  const workspaceDir = resolveConfiguredPath(mergedOptions.workspaceDir, '')
  const aindexDir = path.join(workspaceDir, mergedOptions.aindex.dir)

  return {
    options: mergedOptions,
    workspaceDir,
    aindexDir
  }
}

function deriveEnglishSourcePath(zhPath: string): string {
  if (zhPath.endsWith(SOURCE_PROMPT_EXTENSION)) return `${zhPath.slice(0, -SOURCE_PROMPT_EXTENSION.length)}${MDX_EXTENSION}`

  const ext = path.extname(zhPath)
  if (ext === MDX_EXTENSION) return zhPath
  return `${zhPath}${MDX_EXTENSION}`
}

function stripPromptExtension(filePath: string): string {
  if (filePath.endsWith(SOURCE_PROMPT_EXTENSION)) return filePath.slice(0, -SOURCE_PROMPT_EXTENSION.length)

  if (filePath.endsWith(MDX_EXTENSION)) return filePath.slice(0, -MDX_EXTENSION.length)

  return filePath
}

function listFiles(cwd: string, patterns: readonly string[]): string[] {
  if (!(fs.existsSync(cwd) && fs.statSync(cwd).isDirectory())) return []

  return glob.sync([...patterns], {
    cwd,
    dot: true,
    onlyFiles: true
  }).map(normalizeSlashPath)
}

function buildGlobalMemoryDefinition(env: ResolvedPromptEnvironment): PromptDefinition {
  const zhPath = path.join(env.aindexDir, env.options.aindex.globalPrompt.src)

  return {
    promptId: 'global-memory',
    kind: 'global-memory',
    logicalName: 'global-memory',
    paths: {
      zh: zhPath,
      en: deriveEnglishSourcePath(zhPath),
      dist: path.join(env.aindexDir, env.options.aindex.globalPrompt.dist)
    }
  }
}

function buildWorkspaceMemoryDefinition(env: ResolvedPromptEnvironment): PromptDefinition {
  const zhPath = path.join(env.aindexDir, env.options.aindex.workspacePrompt.src)

  return {
    promptId: 'workspace-memory',
    kind: 'workspace-memory',
    logicalName: 'workspace-memory',
    paths: {
      zh: zhPath,
      en: deriveEnglishSourcePath(zhPath),
      dist: path.join(env.aindexDir, env.options.aindex.workspacePrompt.dist)
    }
  }
}

function buildProjectMemoryDefinition(
  env: ResolvedPromptEnvironment,
  projectName: string,
  relativeName?: string
): PromptDefinition {
  const normalizedProjectName = normalizeRelativeIdentifier(projectName, 'projectName')
  if (!isSingleSegmentIdentifier(normalizedProjectName)) throw new Error('projectName must be a single path segment')

  const normalizedRelativeName = relativeName == null
    ? ''
    : normalizeRelativeIdentifier(relativeName, 'relativeName')
  const sourceDir = normalizedRelativeName.length === 0
    ? path.join(env.aindexDir, env.options.aindex.app.src, normalizedProjectName)
    : path.join(env.aindexDir, env.options.aindex.app.src, normalizedProjectName, normalizedRelativeName)
  const distDir = normalizedRelativeName.length === 0
    ? path.join(env.aindexDir, env.options.aindex.app.dist, normalizedProjectName)
    : path.join(env.aindexDir, env.options.aindex.app.dist, normalizedProjectName, normalizedRelativeName)
  const legacyPath = path.join(sourceDir, `${PROJECT_MEMORY_FILE_NAME}${MDX_EXTENSION}`)
  const logicalSuffix = normalizedRelativeName.length === 0
    ? normalizedProjectName
    : `${normalizedProjectName}/${normalizedRelativeName}`

  return {
    promptId: normalizedRelativeName.length === 0
      ? `project-memory:${normalizedProjectName}`
      : `project-child-memory:${logicalSuffix}`,
    kind: normalizedRelativeName.length === 0 ? 'project-memory' : 'project-child-memory',
    logicalName: logicalSuffix,
    paths: {
      zh: path.join(sourceDir, `${PROJECT_MEMORY_FILE_NAME}${SOURCE_PROMPT_EXTENSION}`),
      en: legacyPath,
      dist: path.join(distDir, `${PROJECT_MEMORY_FILE_NAME}${MDX_EXTENSION}`)
    },
    legacyZhPath: legacyPath
  }
}

function buildSkillDefinition(
  env: ResolvedPromptEnvironment,
  skillName: string
): PromptDefinition {
  const normalizedSkillName = normalizeRelativeIdentifier(skillName, 'skillName')
  if (!isSingleSegmentIdentifier(normalizedSkillName)) throw new Error('skillName must be a single path segment')

  const sourceDir = path.join(env.aindexDir, env.options.aindex.skills.src, normalizedSkillName)
  const distDir = path.join(env.aindexDir, env.options.aindex.skills.dist, normalizedSkillName)

  return {
    promptId: `skill:${normalizedSkillName}`,
    kind: 'skill',
    logicalName: normalizedSkillName,
    paths: {
      zh: path.join(sourceDir, `${SKILL_ENTRY_FILE_NAME}${SOURCE_PROMPT_EXTENSION}`),
      en: path.join(sourceDir, `${SKILL_ENTRY_FILE_NAME}${MDX_EXTENSION}`),
      dist: path.join(distDir, `${SKILL_ENTRY_FILE_NAME}${MDX_EXTENSION}`)
    }
  }
}

function buildSkillChildDocDefinition(
  env: ResolvedPromptEnvironment,
  skillName: string,
  relativeName: string
): PromptDefinition {
  const normalizedSkillName = normalizeRelativeIdentifier(skillName, 'skillName')
  const normalizedRelativeName = normalizeRelativeIdentifier(relativeName, 'relativeName')
  if (!isSingleSegmentIdentifier(normalizedSkillName)) throw new Error('skillName must be a single path segment')

  const sourceDir = path.join(env.aindexDir, env.options.aindex.skills.src, normalizedSkillName)
  const distDir = path.join(env.aindexDir, env.options.aindex.skills.dist, normalizedSkillName)

  return {
    promptId: `skill-child-doc:${normalizedSkillName}/${normalizedRelativeName}`,
    kind: 'skill-child-doc',
    logicalName: `${normalizedSkillName}/${normalizedRelativeName}`,
    paths: {
      zh: path.join(sourceDir, `${normalizedRelativeName}${SOURCE_PROMPT_EXTENSION}`),
      en: path.join(sourceDir, `${normalizedRelativeName}${MDX_EXTENSION}`),
      dist: path.join(distDir, `${normalizedRelativeName}${MDX_EXTENSION}`)
    }
  }
}

function buildFlatPromptDefinition(
  env: ResolvedPromptEnvironment,
  kind: Extract<ManagedPromptKind, 'command' | 'subagent' | 'rule'>,
  relativeName: string
): PromptDefinition {
  const normalizedRelativeName = normalizeRelativeIdentifier(relativeName, 'relativeName')
  const sourceDir = kind === 'command'
    ? path.join(env.aindexDir, env.options.aindex.commands.src)
    : kind === 'subagent'
      ? path.join(env.aindexDir, env.options.aindex.subAgents.src)
      : path.join(env.aindexDir, env.options.aindex.rules.src)
  const distDir = kind === 'command'
    ? path.join(env.aindexDir, env.options.aindex.commands.dist)
    : kind === 'subagent'
      ? path.join(env.aindexDir, env.options.aindex.subAgents.dist)
      : path.join(env.aindexDir, env.options.aindex.rules.dist)

  return {
    promptId: `${kind}:${normalizedRelativeName}`,
    kind,
    logicalName: normalizedRelativeName,
    paths: {
      zh: path.join(sourceDir, `${normalizedRelativeName}${SOURCE_PROMPT_EXTENSION}`),
      en: path.join(sourceDir, `${normalizedRelativeName}${MDX_EXTENSION}`),
      dist: path.join(distDir, `${normalizedRelativeName}${MDX_EXTENSION}`)
    }
  }
}

function parsePromptId(promptId: string): PromptIdDescriptor {
  switch (promptId) {
    case 'global-memory': return {kind: 'global-memory'}
    case 'workspace-memory': return {kind: 'workspace-memory'}
    default: break
  }

  const separatorIndex = promptId.indexOf(':')
  if (separatorIndex === -1) throw new Error(`Unsupported promptId: ${promptId}`)

  const kind = promptId.slice(0, separatorIndex) as ManagedPromptKind
  const rawValue = promptId.slice(separatorIndex + 1)
  const normalizedValue = normalizeRelativeIdentifier(rawValue, 'promptId')

  switch (kind) {
    case 'project-memory':
      if (!isSingleSegmentIdentifier(normalizedValue)) throw new Error('project-memory promptId must include a single project name')
      return {kind, projectName: normalizedValue}
    case 'project-child-memory': {
      const [projectName, ...rest] = normalizedValue.split('/')
      const relativeName = rest.join('/')
      if (projectName == null || relativeName.length === 0) throw new Error('project-child-memory promptId must include project and child path')
      return {kind, projectName, relativeName}
    }
    case 'skill':
      if (!isSingleSegmentIdentifier(normalizedValue)) throw new Error('skill promptId must include a single skill name')
      return {kind, skillName: normalizedValue}
    case 'skill-child-doc': {
      const [skillName, ...rest] = normalizedValue.split('/')
      const relativeName = rest.join('/')
      if (skillName == null || relativeName.length === 0) throw new Error('skill-child-doc promptId must include skill and child path')
      return {kind, skillName, relativeName}
    }
    case 'command':
    case 'subagent':
    case 'rule': return {kind, relativeName: normalizedValue}
    default: throw new Error(`Unsupported promptId: ${promptId}`)
  }
}

function buildPromptDefinitionFromId(
  promptId: string,
  env: ResolvedPromptEnvironment
): PromptDefinition {
  const descriptor = parsePromptId(promptId)

  switch (descriptor.kind) {
    case 'global-memory': return buildGlobalMemoryDefinition(env)
    case 'workspace-memory': return buildWorkspaceMemoryDefinition(env)
    case 'project-memory': return buildProjectMemoryDefinition(env, descriptor.projectName!)
    case 'project-child-memory': return buildProjectMemoryDefinition(env, descriptor.projectName!, descriptor.relativeName)
    case 'skill': return buildSkillDefinition(env, descriptor.skillName!)
    case 'skill-child-doc': return buildSkillChildDocDefinition(env, descriptor.skillName!, descriptor.relativeName!)
    case 'command':
    case 'subagent':
    case 'rule': return buildFlatPromptDefinition(env, descriptor.kind, descriptor.relativeName!)
  }
}

function collectFlatPromptIds(
  env: ResolvedPromptEnvironment,
  kind: Extract<ManagedPromptKind, 'command' | 'subagent' | 'rule'>
): string[] {
  const sourceDir = kind === 'command'
    ? path.join(env.aindexDir, env.options.aindex.commands.src)
    : kind === 'subagent'
      ? path.join(env.aindexDir, env.options.aindex.subAgents.src)
      : path.join(env.aindexDir, env.options.aindex.rules.src)
  const distDir = kind === 'command'
    ? path.join(env.aindexDir, env.options.aindex.commands.dist)
    : kind === 'subagent'
      ? path.join(env.aindexDir, env.options.aindex.subAgents.dist)
      : path.join(env.aindexDir, env.options.aindex.rules.dist)
  const names = new Set<string>()

  for (const match of listFiles(sourceDir, [`**/*${SOURCE_PROMPT_EXTENSION}`, `**/*${MDX_EXTENSION}`])) names.add(stripPromptExtension(match))

  for (const match of listFiles(distDir, [`**/*${MDX_EXTENSION}`])) names.add(stripPromptExtension(match))

  return [...names].sort().map(name => `${kind}:${name}`)
}

function collectSkillPromptIds(env: ResolvedPromptEnvironment): string[] {
  const sourceRoot = path.join(env.aindexDir, env.options.aindex.skills.src)
  const distRoot = path.join(env.aindexDir, env.options.aindex.skills.dist)
  const skillNames = new Set<string>()

  if (fs.existsSync(sourceRoot) && fs.statSync(sourceRoot).isDirectory()) {
    for (const entry of fs.readdirSync(sourceRoot, {withFileTypes: true})) {
      if (entry.isDirectory()) skillNames.add(entry.name)
    }
  }

  if (fs.existsSync(distRoot) && fs.statSync(distRoot).isDirectory()) {
    for (const entry of fs.readdirSync(distRoot, {withFileTypes: true})) {
      if (entry.isDirectory()) skillNames.add(entry.name)
    }
  }

  const promptIds: string[] = []

  for (const skillName of [...skillNames].sort()) {
    promptIds.push(`skill:${skillName}`)

    const sourceDir = path.join(sourceRoot, skillName)
    const distDir = path.join(distRoot, skillName)
    const childNames = new Set<string>()

    for (const match of listFiles(sourceDir, [`**/*${SOURCE_PROMPT_EXTENSION}`, `**/*${MDX_EXTENSION}`])) {
      const stripped = stripPromptExtension(match)
      if (stripped === SKILL_ENTRY_FILE_NAME) continue
      childNames.add(stripped)
    }

    for (const match of listFiles(distDir, [`**/*${MDX_EXTENSION}`])) {
      const stripped = stripPromptExtension(match)
      if (stripped === SKILL_ENTRY_FILE_NAME) continue
      childNames.add(stripped)
    }

    for (const childName of [...childNames].sort()) promptIds.push(`skill-child-doc:${skillName}/${childName}`)
  }

  return promptIds
}

function collectProjectPromptIds(env: ResolvedPromptEnvironment): string[] {
  const sourceRoot = path.join(env.aindexDir, env.options.aindex.app.src)
  const distRoot = path.join(env.aindexDir, env.options.aindex.app.dist)
  const relativeDirs = new Set<string>()

  for (const match of listFiles(sourceRoot, [`**/${PROJECT_MEMORY_FILE_NAME}${SOURCE_PROMPT_EXTENSION}`, `**/${PROJECT_MEMORY_FILE_NAME}${MDX_EXTENSION}`])) {
    const directory = normalizeSlashPath(path.posix.dirname(normalizeSlashPath(match)))
    if (directory !== '.') relativeDirs.add(directory)
  }

  for (const match of listFiles(distRoot, [`**/${PROJECT_MEMORY_FILE_NAME}${MDX_EXTENSION}`])) {
    const directory = normalizeSlashPath(path.posix.dirname(normalizeSlashPath(match)))
    if (directory !== '.') relativeDirs.add(directory)
  }

  const promptIds: string[] = []

  for (const relativeDir of [...relativeDirs].sort()) {
    const [projectName, ...rest] = relativeDir.split('/')
    const childPath = rest.join('/')
    if (projectName == null || projectName.length === 0) continue

    promptIds.push(childPath.length === 0
      ? `project-memory:${projectName}`
      : `project-child-memory:${projectName}/${childPath}`)
  }

  return promptIds
}

function collectDiscoveredPromptIds(env: ResolvedPromptEnvironment): string[] {
  const promptIds = new Set<string>()
  const globalDefinition = buildGlobalMemoryDefinition(env)
  const workspaceDefinition = buildWorkspaceMemoryDefinition(env)

  if (
    fs.existsSync(globalDefinition.paths.zh)
    || fs.existsSync(globalDefinition.paths.en)
    || fs.existsSync(globalDefinition.paths.dist)
  ) {
    promptIds.add(globalDefinition.promptId)
  }

  if (
    fs.existsSync(workspaceDefinition.paths.zh)
    || fs.existsSync(workspaceDefinition.paths.en)
    || fs.existsSync(workspaceDefinition.paths.dist)
  ) {
    promptIds.add(workspaceDefinition.promptId)
  }

  for (const promptId of collectProjectPromptIds(env)) promptIds.add(promptId)
  for (const promptId of collectSkillPromptIds(env)) promptIds.add(promptId)
  for (const promptId of collectFlatPromptIds(env, 'command')) promptIds.add(promptId)
  for (const promptId of collectFlatPromptIds(env, 'subagent')) promptIds.add(promptId)
  for (const promptId of collectFlatPromptIds(env, 'rule')) promptIds.add(promptId)

  return [...promptIds].sort()
}

function parseFrontMatter(content: string): YAMLFrontMatter | undefined {
  try {
    return parseMarkdown<YAMLFrontMatter>(content).yamlFrontMatter
  }
  catch {
    return void 0
  }
}

function readArtifact(
  filePath: string,
  includeContent: boolean,
  legacySource: boolean = false
): PromptArtifactRecord | undefined {
  if (!(fs.existsSync(filePath) && fs.statSync(filePath).isFile())) return void 0

  const stat = fs.statSync(filePath)
  const rawContent = includeContent ? fs.readFileSync(filePath, 'utf8') : void 0

  const artifact: PromptArtifactRecord = {
    path: filePath,
    exists: true,
    mtime: stat.mtime.toISOString(),
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    ...legacySource ? {legacySource: true} : {},
    ...rawContent != null ? {content: rawContent} : {}
  }

  const frontMatter = rawContent != null ? parseFrontMatter(rawContent) : void 0
  if (frontMatter != null) Object.assign(artifact, {frontMatter})

  return artifact
}

function resolveArtifactStatus(
  zhArtifact: PromptArtifactRecord | undefined,
  targetArtifact: PromptArtifactRecord | undefined
): PromptArtifactState {
  if (targetArtifact == null) return 'missing'
  if (zhArtifact != null && targetArtifact.mtimeMs < zhArtifact.mtimeMs) return 'stale'
  return 'ready'
}

function hydratePrompt(
  definition: PromptDefinition,
  includeContent: boolean
): PromptDetails | null {
  const hasCanonicalZh = fs.existsSync(definition.paths.zh)
  const {legacyZhPath} = definition
  const hasLegacyZh = !hasCanonicalZh
    && legacyZhPath != null
    && fs.existsSync(legacyZhPath)
  const zhArtifactPath = hasCanonicalZh
    ? definition.paths.zh
    : hasLegacyZh
      ? legacyZhPath
      : void 0
  const zhArtifact = zhArtifactPath != null
    ? readArtifact(zhArtifactPath, includeContent, hasLegacyZh)
    : void 0
  const enArtifact = hasCanonicalZh || legacyZhPath !== definition.paths.en
    ? readArtifact(definition.paths.en, includeContent)
    : void 0
  const distArtifact = readArtifact(definition.paths.dist, includeContent)

  if (zhArtifact == null && enArtifact == null && distArtifact == null) return null

  const updatedAt = [zhArtifact, enArtifact, distArtifact]
    .filter((artifact): artifact is PromptArtifactRecord => artifact != null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    ?.mtime

  const prompt: PromptDetails = {
    promptId: definition.promptId,
    kind: definition.kind,
    logicalName: definition.logicalName,
    paths: definition.paths,
    exists: {
      zh: zhArtifact != null,
      en: enArtifact != null,
      dist: distArtifact != null
    },
    enStatus: resolveArtifactStatus(zhArtifact, enArtifact),
    distStatus: resolveArtifactStatus(zhArtifact, distArtifact),
    ...updatedAt != null ? {updatedAt} : {},
    ...zhArtifact?.legacySource === true ? {legacyZhSource: true} : {},
    src: {
      ...zhArtifact != null ? {zh: zhArtifact} : {},
      ...enArtifact != null ? {en: enArtifact} : {}
    }
  }

  if (distArtifact != null) Object.assign(prompt, {dist: distArtifact})

  const frontMatter = zhArtifact?.frontMatter ?? enArtifact?.frontMatter ?? distArtifact?.frontMatter
  if (frontMatter != null) Object.assign(prompt, {frontMatter})

  return prompt
}

function matchesFilter<T extends string>(
  value: T,
  allowed: readonly T[] | undefined
): boolean {
  if (allowed == null || allowed.length === 0) return true
  return allowed.includes(value)
}

function matchesQuery(item: PromptCatalogItem, query: string | undefined): boolean {
  if (query == null || query.trim().length === 0) return true
  const normalizedQuery = query.trim().toLowerCase()
  return item.promptId.toLowerCase().includes(normalizedQuery)
    || item.logicalName.toLowerCase().includes(normalizedQuery)
}

function toCatalogItem(prompt: PromptDetails): PromptCatalogItem {
  return {
    promptId: prompt.promptId,
    kind: prompt.kind,
    logicalName: prompt.logicalName,
    paths: prompt.paths,
    exists: prompt.exists,
    enStatus: prompt.enStatus,
    distStatus: prompt.distStatus,
    ...prompt.updatedAt != null ? {updatedAt: prompt.updatedAt} : {},
    ...prompt.legacyZhSource === true ? {legacyZhSource: true} : {}
  }
}

function isProjectMemoryDefinition(definition: PromptDefinition): boolean {
  return LEGACY_PROJECT_MEMORY_KINDS.has(definition.kind)
}

function writeTextFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  fs.writeFileSync(filePath, content, 'utf8')
}

function prepareProjectMemoryForEnglishWrite(definition: PromptDefinition): void {
  if (!isProjectMemoryDefinition(definition)) return
  if (fs.existsSync(definition.paths.zh)) return
  if (definition.legacyZhPath == null || !fs.existsSync(definition.legacyZhPath)) return

  const legacyContent = fs.readFileSync(definition.legacyZhPath, 'utf8')
  writeTextFile(definition.paths.zh, legacyContent)
}

function migrateLegacyProjectMemorySourceOnZhWrite(definition: PromptDefinition): void {
  if (!isProjectMemoryDefinition(definition)) return
  if (definition.legacyZhPath == null || definition.legacyZhPath === definition.paths.zh) return
  if (!fs.existsSync(definition.legacyZhPath)) return

  fs.rmSync(definition.legacyZhPath, {force: true})
}

export async function listPrompts(
  options: ListPromptsOptions = {}
): Promise<PromptCatalogItem[]> {
  const env = resolvePromptEnvironment(options)
  const items = collectDiscoveredPromptIds(env)
    .map(promptId => hydratePrompt(buildPromptDefinitionFromId(promptId, env), false))
    .filter((item): item is PromptDetails => item != null)
    .map(toCatalogItem)
    .filter(item => matchesFilter(item.kind, options.kinds))
    .filter(item => matchesFilter(item.enStatus, options.enStatus))
    .filter(item => matchesFilter(item.distStatus, options.distStatus))
    .filter(item => matchesQuery(item, options.query))

  return items.sort((a, b) => a.promptId.localeCompare(b.promptId))
}

export async function getPrompt(
  promptId: string,
  options: PromptServiceOptions = {}
): Promise<PromptDetails | null> {
  const env = resolvePromptEnvironment(options)
  return hydratePrompt(buildPromptDefinitionFromId(promptId, env), true)
}

export async function upsertPromptSource(
  input: UpsertPromptSourceInput
): Promise<PromptDetails> {
  const env = resolvePromptEnvironment(input)
  const locale = input.locale ?? 'zh'
  const definition = buildPromptDefinitionFromId(input.promptId, env)

  if (locale === 'zh') {
    writeTextFile(definition.paths.zh, input.content)
    migrateLegacyProjectMemorySourceOnZhWrite(definition)
  } else {
    prepareProjectMemoryForEnglishWrite(definition)
    writeTextFile(definition.paths.en, input.content)
  }

  const prompt = hydratePrompt(definition, true)
  if (prompt == null) throw new Error(`Failed to load prompt after write: ${input.promptId}`)
  return prompt
}

export async function writePromptArtifacts(
  input: WritePromptArtifactsInput
): Promise<PromptDetails> {
  if (input.enContent == null && input.distContent == null) throw new Error('writePromptArtifacts requires enContent or distContent')

  const env = resolvePromptEnvironment(input)
  const definition = buildPromptDefinitionFromId(input.promptId, env)

  if (input.enContent != null) {
    prepareProjectMemoryForEnglishWrite(definition)
    writeTextFile(definition.paths.en, input.enContent)
  }

  if (input.distContent != null) writeTextFile(definition.paths.dist, input.distContent)

  const prompt = hydratePrompt(definition, true)
  if (prompt == null) throw new Error(`Failed to load prompt after write: ${input.promptId}`)
  return prompt
}

export async function resolvePromptDefinition(
  promptId: string,
  options: PromptServiceOptions = {}
): Promise<PromptCatalogPaths> {
  const env = resolvePromptEnvironment(options)
  return buildPromptDefinitionFromId(promptId, env).paths
}
