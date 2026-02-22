import type {UserConfigFile} from '@truenine/plugin-shared'
import {bundles, getDefaultConfigContent} from '@truenine/init-bundle'

export const PathPlaceholders = {
  USER_HOME: '~',
  WORKSPACE: '$WORKSPACE'
} as const

type DefaultUserConfig = Readonly<Required<Omit<UserConfigFile, never>>> // Default user config type
const _bundleContent = bundles['public/tnmsc.example.json']?.content ?? getDefaultConfigContent()
export const DEFAULT_USER_CONFIG = JSON.parse(_bundleContent) as DefaultUserConfig // Imported from @truenine/init-bundle package
