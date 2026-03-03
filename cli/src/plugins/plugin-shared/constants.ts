import type {UserConfigFile} from './types/ConfigTypes.schema'

export const PathPlaceholders = {
  USER_HOME: '~',
  WORKSPACE: '$WORKSPACE'
} as const

type DefaultUserConfig = Readonly<Required<Omit<UserConfigFile, never>>>
export const DEFAULT_USER_CONFIG = {} as DefaultUserConfig
