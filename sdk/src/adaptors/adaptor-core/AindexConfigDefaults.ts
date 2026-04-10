export interface AindexDirPairLike {
  readonly src: string
  readonly dist: string
}

export const AINDEX_DEFAULT_DIR_NAME = 'aindex'

export const AINDEX_PROJECT_SERIES_NAMES = ['app', 'ext', 'arch', 'softwares'] as const

export type AindexProjectSeriesName = (typeof AINDEX_PROJECT_SERIES_NAMES)[number]

export const AINDEX_CONFIG_DIRECTORY_PAIR_KEYS = [
  'skills',
  'commands',
  'subAgents',
  'rules',
  ...AINDEX_PROJECT_SERIES_NAMES
] as const

export const AINDEX_CONFIG_FILE_PAIR_KEYS = [
  'globalPrompt',
  'workspacePrompt'
] as const

export const AINDEX_CONFIG_PAIR_KEYS = [
  'skills',
  'commands',
  'subAgents',
  'rules',
  'globalPrompt',
  'workspacePrompt',
  ...AINDEX_PROJECT_SERIES_NAMES
] as const

export type AindexConfigPairKey = (typeof AINDEX_CONFIG_PAIR_KEYS)[number]
export type AindexConfigDirectoryPairKey = (typeof AINDEX_CONFIG_DIRECTORY_PAIR_KEYS)[number]
export type AindexConfigFilePairKey = (typeof AINDEX_CONFIG_FILE_PAIR_KEYS)[number]

export const AINDEX_PROMPT_TREE_DIRECTORY_PAIR_KEYS = [
  'skills',
  'commands',
  'subAgents',
  ...AINDEX_PROJECT_SERIES_NAMES
] as const satisfies readonly AindexConfigDirectoryPairKey[]

export type AindexPromptTreeDirectoryPairKey = (typeof AINDEX_PROMPT_TREE_DIRECTORY_PAIR_KEYS)[number]

interface MutableAindexDirPair {
  src: string
  dist: string
}

export type AindexConfigLike = {
  dir: string
} & {
  [K in AindexConfigPairKey]: MutableAindexDirPair
}

export const AINDEX_CONFIG_PAIR_DEFAULTS = {
  skills: {src: 'skills', dist: 'dist/skills'},
  commands: {src: 'commands', dist: 'dist/commands'},
  subAgents: {src: 'subagents', dist: 'dist/subagents'},
  rules: {src: 'rules', dist: 'dist/rules'},
  globalPrompt: {src: 'global.src.mdx', dist: 'dist/global.mdx'},
  workspacePrompt: {src: 'workspace.src.mdx', dist: 'dist/workspace.mdx'},
  app: {src: 'app', dist: 'dist/app'},
  ext: {src: 'ext', dist: 'dist/ext'},
  arch: {src: 'arch', dist: 'dist/arch'},
  softwares: {src: 'softwares', dist: 'dist/softwares'}
} as const satisfies Record<AindexConfigPairKey, AindexDirPairLike>

function cloneAindexConfigPairs(): {[K in AindexConfigPairKey]: MutableAindexDirPair} {
  return Object.fromEntries(
    AINDEX_CONFIG_PAIR_KEYS.map(key => [
      key,
      {
        ...AINDEX_CONFIG_PAIR_DEFAULTS[key]
      }
    ])
  ) as {[K in AindexConfigPairKey]: MutableAindexDirPair}
}

export function buildDefaultAindexConfig(): AindexConfigLike {
  return {
    dir: AINDEX_DEFAULT_DIR_NAME,
    ...cloneAindexConfigPairs()
  }
}

export function mergeAindexConfig<T extends AindexConfigLike>(
  base: T,
  override?: Partial<T>
): T {
  if (override == null) return base

  const mergedPairs = Object.fromEntries(
    AINDEX_CONFIG_PAIR_KEYS.map(key => [
      key,
      {
        ...base[key],
        ...override[key]
      }
    ])
  ) as {[K in AindexConfigPairKey]: T[K]}

  return {
    ...base,
    ...override,
    dir: override.dir ?? base.dir,
    ...mergedPairs
  }
}
