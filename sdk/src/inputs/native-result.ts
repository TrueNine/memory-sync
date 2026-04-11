import type {InputCollectedContext} from '@/adaptors/adaptor-core/InputTypes'
import type {ILogger} from '@/libraries/logger'
import {IDEKind, NamingCaseKind, PromptKind} from '@/adaptors/adaptor-core/enums'

interface NativeDiagnostic {
  readonly level: string
  readonly code: string
  readonly title: string
  readonly exactFix?: readonly string[]
}

interface NativeDebugLog {
  readonly message: string
  readonly payload?: unknown
}

type NativeLoggedResult = Partial<InputCollectedContext> & {
  readonly diagnostics?: readonly NativeDiagnostic[]
  readonly debugLogs?: readonly NativeDebugLog[]
}

interface PathLike {
  readonly path: string
  readonly pathKind?: string
  readonly basePath?: string
  readonly absolutePath?: string
  readonly directoryName?: string
  getDirectoryName?: () => string
  getAbsolutePath?: () => string
}

const PROMPT_KIND_MAP: Readonly<Record<string, PromptKind>> = {
  FastCommand: PromptKind.Command,
  GlobalMemory: PromptKind.GlobalMemory,
  ProjectChildrenMemory: PromptKind.ProjectChildrenMemory,
  ProjectRootMemory: PromptKind.ProjectRootMemory,
  Readme: PromptKind.Readme,
  Rule: PromptKind.Rule,
  Skill: PromptKind.Skill,
  SkillChildDoc: PromptKind.SkillChildDoc,
  SkillMcpConfig: PromptKind.SkillMcpConfig,
  SkillResource: PromptKind.SkillResource,
  SubAgent: PromptKind.SubAgent
}

const IDE_KIND_MAP: Readonly<Record<string, IDEKind>> = {
  EditorConfig: IDEKind.EditorConfig,
  Git: IDEKind.Git,
  IntellijIDEA: IDEKind.IntellijIDEA,
  Original: IDEKind.Original,
  VSCode: IDEKind.VSCode,
  Zed: IDEKind.Zed
}

const NAMING_CASE_MAP: Readonly<Record<string, NamingCaseKind>> = {
  CamelCase: NamingCaseKind.CamelCase,
  KebabCase: NamingCaseKind.KebabCase,
  LowerCase: NamingCaseKind.LowerCase,
  Original: NamingCaseKind.Original,
  PascalCase: NamingCaseKind.PascalCase,
  SnakeCase: NamingCaseKind.SnakeCase,
  UpperCase: NamingCaseKind.UpperCase
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function hasPathShape(value: unknown): value is PathLike {
  return isRecord(value) && typeof value['path'] === 'string'
}

function ensurePathHelpers(pathLike: PathLike): void {
  pathLike.getDirectoryName ??= () => {
    if (typeof pathLike.directoryName === 'string') return pathLike.directoryName

    const normalizedPath = pathLike.path.replaceAll('\\', '/').replaceAll(/\/+$/gu, '')
    const slashIndex = normalizedPath.lastIndexOf('/')
    return slashIndex === -1 ? '' : normalizedPath.slice(0, slashIndex)
  }

  if (pathLike.basePath != null && pathLike.getAbsolutePath == null) {
    pathLike.getAbsolutePath = () => {
      if (typeof pathLike.absolutePath === 'string') return pathLike.absolutePath
      return [pathLike.basePath, pathLike.path]
        .filter(segment => segment != null && segment.length > 0)
        .join('/')
        .replaceAll(/\/+/gu, '/')
    }
  }
}

function normalizeEnumValue<T extends string>(
  input: unknown,
  mapping: Readonly<Record<string, T>>
): T | unknown {
  if (typeof input !== 'string') return input
  return mapping[input] ?? input
}

function normalizeFrontMatter(frontMatter: unknown): void {
  if (!isRecord(frontMatter)) return

  if ('namingCase' in frontMatter) {
    frontMatter['namingCase'] = normalizeEnumValue(frontMatter['namingCase'], NAMING_CASE_MAP)
  }
}

function normalizePromptLike(value: Record<string, unknown>): void {
  if ('type' in value) {
    value['type'] = normalizeEnumValue(value['type'], PROMPT_KIND_MAP)
  }

  if ('dir' in value && hasPathShape(value['dir'])) {
    ensurePathHelpers(value['dir'])
  }

  if ('workingChildDirectoryPath' in value && hasPathShape(value['workingChildDirectoryPath'])) {
    ensurePathHelpers(value['workingChildDirectoryPath'])
  }

  if ('yamlFrontMatter' in value) {
    normalizeFrontMatter(value['yamlFrontMatter'])
  }

  if ('rawFrontMatter' in value && value['rawFrontMatter'] == null && typeof value['rawMdxContent'] === 'string') {
    value['rawFrontMatter'] = void 0
  }

  if (!('commandPrefix' in value) && typeof value['series'] === 'string') {
    value['commandPrefix'] = value['series']
  }

  if (!('prefix' in value) && typeof value['series'] === 'string') {
    value['prefix'] = value['series']
  }

  if ('childDocs' in value && Array.isArray(value['childDocs'])) {
    for (const childDoc of value['childDocs']) {
      if (!isRecord(childDoc)) continue
      normalizePromptLike(childDoc)
      if (typeof childDoc['fileName'] !== 'string' && typeof childDoc['relativePath'] === 'string') {
        const normalizedPath = childDoc['relativePath'].replaceAll('\\', '/')
        childDoc['fileName'] = normalizedPath.split('/').at(-1) ?? normalizedPath
      }
    }
  }

  if ('resources' in value && Array.isArray(value['resources'])) {
    for (const resource of value['resources']) {
      if (!isRecord(resource)) continue
      if ('type' in resource) {
        resource['type'] = normalizeEnumValue(resource['type'], PROMPT_KIND_MAP)
      }
    }
  }

  if ('mcpConfig' in value && isRecord(value['mcpConfig']) && 'type' in value['mcpConfig']) {
    value['mcpConfig']['type'] = normalizeEnumValue(value['mcpConfig']['type'], PROMPT_KIND_MAP)
  }
}

function normalizeWorkspace(value: Record<string, unknown>): void {
  const {directory, projects} = value
  if (hasPathShape(directory)) ensurePathHelpers(directory)

  if (!Array.isArray(projects)) return

  for (const project of projects) {
    if (!isRecord(project)) continue
    const relativePath = project['dirFromWorkspacePath']
    if (hasPathShape(relativePath)) ensurePathHelpers(relativePath)
  }
}

function normalizeIdeConfig(value: Record<string, unknown>): void {
  if ('type' in value) {
    value['type'] = normalizeEnumValue(value['type'], IDE_KIND_MAP)
  }

  if ('dir' in value && hasPathShape(value['dir'])) {
    ensurePathHelpers(value['dir'])
  }
}

function normalizeCollectedContextShape(parsed: NativeLoggedResult): NativeLoggedResult {
  if (parsed.workspace != null && isRecord(parsed.workspace)) {
    normalizeWorkspace(parsed.workspace)
  }

  for (const key of ['vscodeConfigFiles', 'zedConfigFiles', 'jetbrainsConfigFiles', 'editorConfigFiles'] as const) {
    const collection = parsed[key]
    if (!Array.isArray(collection)) continue
    for (const entry of collection) {
      if (isRecord(entry)) normalizeIdeConfig(entry)
    }
  }

  for (const key of ['commands', 'subAgents', 'skills', 'rules', 'readmePrompts'] as const) {
    const collection = parsed[key]
    if (!Array.isArray(collection)) continue
    for (const entry of collection) {
      if (isRecord(entry)) normalizePromptLike(entry)
    }
  }

  if (parsed.globalMemory != null && isRecord(parsed.globalMemory)) {
    normalizePromptLike(parsed.globalMemory)
  }

  return parsed
}

function logNativeDiagnostics(logger: ILogger, parsed: NativeLoggedResult): void {
  if (parsed.diagnostics != null) {
    for (const diagnostic of parsed.diagnostics) {
      const input = {
        code: diagnostic.code,
        title: diagnostic.title,
        rootCause: [diagnostic.title] as const,
        ...diagnostic.exactFix != null && diagnostic.exactFix.length > 0
          ? {exactFix: diagnostic.exactFix as [string, ...string[]]}
          : {}
      }
      if (diagnostic.level === 'warn') {
        logger.warn(input)
      } else if (diagnostic.level === 'error') {
        logger.error(input)
      }
    }
  }

  if (parsed.debugLogs != null) {
    for (const log of parsed.debugLogs) {
      logger.debug(log.message, log.payload)
    }
  }
}

export function parseNativeInputResult<T extends Partial<InputCollectedContext>>(result: string): T {
  const parsed = JSON.parse(result) as NativeLoggedResult
  return normalizeCollectedContextShape(parsed) as T
}

export function parseLoggedNativeInputResult<T extends Partial<InputCollectedContext>>(
  logger: ILogger,
  result: string
): T {
  const parsed = parseNativeInputResult<T>(result) as NativeLoggedResult
  logNativeDiagnostics(logger, parsed)
  return parsed as T
}
