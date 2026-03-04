import type {UserConfigFile} from '../types/ConfigTypes.schema'

export const PathPlaceholders = {
  USER_HOME: '~',
  WORKSPACE: '$WORKSPACE'
} as const

type DefaultUserConfig = Readonly<Required<Omit<UserConfigFile, never>>>
export const DEFAULT_USER_CONFIG = {} as DefaultUserConfig

export {
  PLUGIN_NAMES
} from './plugin-names'
export type {
  PluginName
} from './plugin-names'

export {
  OutputFileNames,
  OutputPrefixes,
  OutputSubdirectories,
  FrontMatterFields,
  FileExtensions,
  GlobalConfigDirs,
  IgnoreFiles,
  PreservedSkills,
  ToolPresets
} from './output-constants'
