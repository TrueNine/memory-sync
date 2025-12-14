export const PathPlaceholders = {
  USER_HOME: '~',
  WORKSPACE: '$WORKSPACE',
  SHADOW_PROJECT: '$SHADOW_PROJECT',
} as const

export const DEFAULT_WORKSPACE_DIR = '~/project'
export const DEFAULT_SHADOW_PROJECT_SUFFIX = 'aindex'
export const DEFAULT_SHADOW_SKILL_SOURCE_DIR = '$SHADOW_PROJECT/dist/skills'
export const DEFAULT_SHADOW_FAST_COMMAND_DIR = '$SHADOW_PROJECT/dist/commands'
export const DEFAULT_SHADOW_SUB_AGENT_DIR = '$SHADOW_PROJECT/dist/agents'
export const DEFAULT_SHADOW_SOURCE_PROJECT_DIR = '$SHADOW_PROJECT/ref'
export const DEFAULT_GLOBAL_MEMORY_FILE = '$SHADOW_PROJECT/dist/GLOBAL.md'
