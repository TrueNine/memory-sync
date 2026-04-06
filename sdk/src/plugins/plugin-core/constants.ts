import type {UserConfigFile} from './ConfigTypes.schema'

export const PathPlaceholders = {
  USER_HOME: '~',
  WORKSPACE: '$WORKSPACE'
} as const

type DefaultUserConfig = Readonly<Required<Omit<UserConfigFile, never>>>
export const DEFAULT_USER_CONFIG = {} as DefaultUserConfig

export const PLUGIN_NAMES = {
  AgentsOutput: 'AgentsOutputPlugin',
  GeminiCLIOutput: 'GeminiCLIOutputPlugin',
  CursorOutput: 'CursorOutputPlugin',
  WindsurfOutput: 'WindsurfOutputPlugin',
  ClaudeCodeCLIOutput: 'ClaudeCodeCLIOutputPlugin',
  KiroIDEOutput: 'KiroCLIOutputPlugin',
  OpencodeCLIOutput: 'OpencodeCLIOutputPlugin',
  OpenAICodexCLIOutput: 'CodexCLIOutputPlugin',
  DroidCLIOutput: 'DroidCLIOutputPlugin',
  WarpIDEOutput: 'WarpIDEOutputPlugin',
  TraeIDEOutput: 'TraeIDEOutputPlugin',
  TraeCNIDEOutput: 'TraeCNIDEOutputPlugin',
  QoderIDEOutput: 'QoderIDEPluginOutputPlugin',
  JetBrainsCodeStyleOutput: 'JetBrainsIDECodeStyleConfigOutputPlugin',
  JetBrainsAICodexOutput: 'JetBrainsAIAssistantCodexOutputPlugin',
  AgentSkillsCompactOutput: 'GenericSkillsOutputPlugin',
  GitExcludeOutput: 'GitExcludeOutputPlugin',
  ReadmeOutput: 'ReadmeMdConfigFileOutputPlugin',
  VSCodeOutput: 'VisualStudioCodeIDEConfigOutputPlugin',
  ZedOutput: 'ZedIDEConfigOutputPlugin',
  AntigravityOutput: 'AntigravityOutputPlugin'
} as const

export type PluginName = (typeof PLUGIN_NAMES)[keyof typeof PLUGIN_NAMES]

export const WORKSPACE_ROOT_PROJECT_NAME = '__workspace__'

/**
 * Constants for output plugins.
 */
export const OutputFileNames = {
  SKILL: 'SKILL.md',
  CURSOR_GLOBAL_RULE: 'global.mdc',
  CURSOR_PROJECT_RULE: 'always.md',
  MCP_CONFIG: 'mcp.json',
  CLAUDE_MEMORY: 'CLAUDE.md',
  WINDSURF_GLOBAL_RULE: 'global_rules.md'
} as const

export const OutputPrefixes = {
  RULE: 'rule-',
  CHILD_RULE: 'glob-'
} as const

export const OutputSubdirectories = {
  RULES: 'rules',
  COMMANDS: 'commands',
  SKILLS: 'skills',
  AGENTS: 'agents',
  CURSOR_SKILLS: 'skills-cursor'
} as const

export const FrontMatterFields = {
  ALWAYS_APPLY: 'alwaysApply',
  GLOBS: 'globs',
  DESCRIPTION: 'description',
  NAME: 'name',
  TRIGGER: 'trigger'
} as const

export const FileExtensions = {
  MD: '.md',
  MDC: '.mdc',
  MDX: '.mdx',
  JSON: '.json'
} as const

export const SourcePromptExtensions = {
  PRIMARY: '.src.mdx'
} as const

export const SourcePromptFileExtensions = [SourcePromptExtensions.PRIMARY] as const

export const SourceLocaleExtensions = {
  zh: SourcePromptFileExtensions,
  en: FileExtensions.MDX
} as const

export function hasSourcePromptExtension(fileName: string): boolean {
  return SourcePromptFileExtensions.some(extension => fileName.endsWith(extension))
}

export const GlobalConfigDirs = {
  CURSOR: '.cursor',
  CLAUDE: '.claude',
  WINDSURF: '.codeium/windsurf',
  WINDSURF_RULES: '.windsurf'
} as const

export const IgnoreFiles = {
  CURSOR: '.cursorignore',
  WINDSURF: '.codeignore',
  WINDSURF_LEGACY: '.codeiumignore'
} as const

export const PreservedSkills = {
  CURSOR: new Set<string>(['create-rule', 'create-skill', 'create-subagent', 'migrate-to-skills', 'update-cursor-settings'])
} as const

export const ToolPresets = {
  CLAUDE_CODE: 'claudeCode'
} as const
