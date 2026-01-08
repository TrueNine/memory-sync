import type {UserConfigFile} from '@/types/ConfigTypes'

export const PathPlaceholders = {
  USER_HOME: '~',
  WORKSPACE: '$WORKSPACE',
  SHADOW_SOURCE_PROJECT: '$SHADOW_SOURCE_PROJECT',
} as const

/**
 * Default user config values from public/tnmsc.example.json
 * Injected at build time via __TEMPLATE_TNMSC_EXAMPLE__
 */
export const DEFAULT_USER_CONFIG = JSON.parse(__TEMPLATE_TNMSC_EXAMPLE__) as Readonly<
  Required<Omit<UserConfigFile, 'externalProjects' | 'excludePatterns'>>
>
