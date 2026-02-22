import type {UserConfigFile} from './types/ConfigTypes.schema'
import {bundles} from '@truenine/init-bundle'

export const PathPlaceholders = {
  USER_HOME: '~',
  WORKSPACE: '$WORKSPACE'
} as const

type DefaultUserConfig = Readonly<Required<Omit<UserConfigFile, never>>> // Default user config type
export const DEFAULT_USER_CONFIG = JSON.parse(bundles['public/tnmsc.example.json'].content) as DefaultUserConfig // Imported from @truenine/init-bundle package
