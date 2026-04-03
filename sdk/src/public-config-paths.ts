import type {IDEKind} from './plugins/plugin-core/enums'
import type {ProjectIDEConfigFile} from './plugins/plugin-core/InputTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import {resolvePublicPath} from '@truenine/script-runtime'
import {AINDEX_FILE_NAMES} from './plugins/plugin-core/AindexTypes'
import {FilePathKind} from './plugins/plugin-core/enums'

export const PUBLIC_CONFIG_DEFINITION_DIR = 'public'
export const PUBLIC_PROXY_FILE_NAME = 'proxy.ts'

export const PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH = '.gitignore'
export const PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH = '.git/info/exclude'

export const AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS = [
  AINDEX_FILE_NAMES.QODER_IGNORE,
  AINDEX_FILE_NAMES.CURSOR_IGNORE,
  AINDEX_FILE_NAMES.WARP_INDEX_IGNORE,
  AINDEX_FILE_NAMES.AI_IGNORE,
  AINDEX_FILE_NAMES.WINDSURF_IGNORE,
  AINDEX_FILE_NAMES.CODEIUM_IGNORE,
  '.kiroignore',
  '.traeignore'
] as const

export const KNOWN_PUBLIC_CONFIG_TARGET_RELATIVE_PATHS = [
  PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH,
  PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH,
  AINDEX_FILE_NAMES.EDITOR_CONFIG,
  AINDEX_FILE_NAMES.VSCODE_SETTINGS,
  AINDEX_FILE_NAMES.VSCODE_EXTENSIONS,
  AINDEX_FILE_NAMES.ZED_SETTINGS,
  AINDEX_FILE_NAMES.IDEA_PROJECT_XML,
  AINDEX_FILE_NAMES.IDEA_CODE_STYLE_CONFIG_XML,
  AINDEX_FILE_NAMES.IDEA_GITIGNORE,
  ...AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS
] as const

export interface PublicDefinitionResolveOptions {
  readonly command?: ProxyCommand | undefined
  readonly workspaceDir?: string | undefined
}

type ProxyCommand = 'execute' | 'dry-run' | 'clean' | 'plugins'

interface ProxyContext {
  readonly cwd: string
  readonly workspaceDir: string
  readonly aindexDir: string
  readonly command: ProxyCommand
  readonly platform: NodeJS.Platform
}

const publicDefinitionPathCache = new Map<string, string>()

function normalizeTargetRelativePath(targetRelativePath: string): string {
  const normalizedPath = targetRelativePath
    .split(/[\\/]+/)
    .filter(segment => segment.length > 0)
    .join('/')

  if (normalizedPath.length === 0) {
    throw new Error('public target relative path cannot be empty')
  }
  return normalizedPath
}

function getPublicRootDir(aindexDir: string): string {
  return path.join(aindexDir, PUBLIC_CONFIG_DEFINITION_DIR)
}

function getPublicProxyPath(aindexDir: string): string {
  return path.join(getPublicRootDir(aindexDir), PUBLIC_PROXY_FILE_NAME)
}

function getResolveCommand(options?: PublicDefinitionResolveOptions): ProxyCommand {
  return options?.command ?? 'execute'
}

function getResolveWorkspaceDir(aindexDir: string, options?: PublicDefinitionResolveOptions): string {
  return path.resolve(options?.workspaceDir ?? path.dirname(aindexDir))
}

function buildProxyContext(aindexDir: string, workspaceDir: string, command: ProxyCommand): ProxyContext {
  const resolvedAindexDir = path.resolve(aindexDir)

  return {
    cwd: workspaceDir,
    workspaceDir,
    aindexDir: resolvedAindexDir,
    command,
    platform: process.platform
  }
}

function resolvePublicPathForDefinition(filePath: string, ctx: ProxyContext, logicalPath: string): string {
  // `tsc` resolves this workspace package correctly, but ESLint's type-aware rules
  // sometimes treat it as an error-typed export during monorepo lint execution.

  return resolvePublicPath(filePath, ctx, logicalPath)
}

function resolvePublicDefinitionRelativePath(aindexDir: string, targetRelativePath: string, options?: PublicDefinitionResolveOptions): string {
  const normalizedTargetPath = normalizeTargetRelativePath(targetRelativePath)
  if (normalizedTargetPath === PUBLIC_PROXY_FILE_NAME) {
    return PUBLIC_PROXY_FILE_NAME
  }

  const proxyFilePath = getPublicProxyPath(aindexDir)
  if (!(fs.existsSync(proxyFilePath) && fs.statSync(proxyFilePath).isFile())) {
    return normalizedTargetPath
  }

  const command = getResolveCommand(options)
  const workspaceDir = getResolveWorkspaceDir(aindexDir, options)
  const cacheKey = [proxyFilePath, workspaceDir, command, normalizedTargetPath].join('::')
  const cachedPath = publicDefinitionPathCache.get(cacheKey)
  if (cachedPath != null) return cachedPath

  const resolvedRelativePath = resolvePublicPathForDefinition(proxyFilePath, buildProxyContext(aindexDir, workspaceDir, command), normalizedTargetPath)

  publicDefinitionPathCache.set(cacheKey, resolvedRelativePath)
  return resolvedRelativePath
}

export function resolvePublicDefinitionPath(aindexDir: string, targetRelativePath: string, options?: PublicDefinitionResolveOptions): string {
  const resolvedRelativePath = resolvePublicDefinitionRelativePath(aindexDir, targetRelativePath, options)
  return path.join(getPublicRootDir(aindexDir), ...resolvedRelativePath.split(/[\\/]+/))
}

export function collectKnownPublicConfigDefinitionPaths(aindexDir: string, options?: PublicDefinitionResolveOptions): string[] {
  const resolvedPaths = new Set<string>([resolvePublicDefinitionPath(aindexDir, PUBLIC_PROXY_FILE_NAME)])

  for (const targetRelativePath of KNOWN_PUBLIC_CONFIG_TARGET_RELATIVE_PATHS) {
    resolvedPaths.add(resolvePublicDefinitionPath(aindexDir, targetRelativePath, options))
  }

  return [...resolvedPaths]
}

export function readPublicIdeConfigDefinitionFile<T extends IDEKind>(
  type: T,
  targetRelativePath: string,
  aindexDir: string,
  fs: typeof import('node:fs'),
  options?: PublicDefinitionResolveOptions
): ProjectIDEConfigFile<T> | undefined {
  const absolutePath = resolvePublicDefinitionPath(aindexDir, targetRelativePath, options)
  if (!(fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile())) {
    return void 0
  }

  const content = fs.readFileSync(absolutePath, 'utf8')
  return {
    type,
    content,
    length: content.length,
    filePathKind: FilePathKind.Absolute,
    dir: {
      pathKind: FilePathKind.Absolute,
      path: absolutePath,
      getDirectoryName: () => path.basename(absolutePath)
    }
  }
}
