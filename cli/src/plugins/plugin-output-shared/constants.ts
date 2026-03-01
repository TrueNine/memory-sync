/**
 * Constants for output plugins
 * Centralizes hardcoded strings to improve maintainability and reduce duplication
 */

/**
 * File and directory names used across output plugins
 */
export const OutputFileNames = {
  /** Default skill file name */
  SKILL: 'SKILL.md',
  /** Cursor global rule file */
  CURSOR_GLOBAL_RULE: 'global.mdc',
  /** Cursor project rule file */
  CURSOR_PROJECT_RULE: 'always.md',
  /** MCP configuration file */
  MCP_CONFIG: 'mcp.json',
  /** Claude Code project memory file */
  CLAUDE_MEMORY: 'CLAUDE.md',
  /** Windsurf global rules file */
  WINDSURF_GLOBAL_RULE: 'global_rules.md'
} as const

/**
 * Prefixes used for file naming
 */
export const OutputPrefixes = {
  /** Rule file prefix */
  RULE: 'rule-',
  /** Child rule/glob prefix */
  CHILD_RULE: 'glob-'
} as const

/**
 * Subdirectory names used by output plugins
 */
export const OutputSubdirectories = {
  /** Rules subdirectory */
  RULES: 'rules',
  /** Commands subdirectory */
  COMMANDS: 'commands',
  /** Skills subdirectory */
  SKILLS: 'skills',
  /** Agents subdirectory */
  AGENTS: 'agents',
  /** Cursor-specific skills subdirectory */
  CURSOR_SKILLS: 'skills-cursor'
} as const

/**
 * Front matter field names
 */
export const FrontMatterFields = {
  /** Always apply flag */
  ALWAYS_APPLY: 'alwaysApply',
  /** Globs pattern */
  GLOBS: 'globs',
  /** Description field */
  DESCRIPTION: 'description',
  /** Name field */
  NAME: 'name',
  /** Trigger type */
  TRIGGER: 'trigger'
} as const

/**
 * File extensions
 */
export const FileExtensions = {
  /** Markdown file */
  MD: '.md',
  /** Markdown with cursor config */
  MDC: '.mdc',
  /** MDX file */
  MDX: '.mdx',
  /** JSON file */
  JSON: '.json'
} as const

/**
 * Global configuration directory names
 */
export const GlobalConfigDirs = {
  /** Cursor config directory */
  CURSOR: '.cursor',
  /** Claude Code config directory */
  CLAUDE: '.claude',
  /** Windsurf/Codeium config directory */
  WINDSURF: '.codeium/windsurf',
  /** Generic Windsurf rules directory */
  WINDSURF_RULES: '.windsurf'
} as const

/**
 * Ignore file names
 */
export const IgnoreFiles = {
  /** Cursor ignore file */
  CURSOR: '.cursorignore',
  /** Windsurf ignore file */
  WINDSURF: '.codeiumignore'
} as const

/**
 * Preserved skill names that should not be overwritten
 */
export const PreservedSkills = {
  CURSOR: new Set<string>([
    'create-rule',
    'create-skill',
    'create-subagent',
    'migrate-to-skills',
    'update-cursor-settings'
  ])
} as const

/**
 * Tool preset identifiers
 */
export const ToolPresets = {
  CLAUDE_CODE: 'claudeCode'
} as const
