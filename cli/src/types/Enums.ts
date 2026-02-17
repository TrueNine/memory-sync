export enum PluginKind {
  Input = 'Input',
  Output = 'Output'
}

export enum PromptKind {
  GlobalMemory = 'GlobalMemory',
  ProjectRootMemory = 'ProjectRootMemory',
  ProjectChildrenMemory = 'ProjectChildrenMemory',
  FastCommand = 'FastCommand',
  SubAgent = 'SubAgent',
  Skill = 'Skill',
  SkillChildDoc = 'SkillChildDoc',
  SkillResource = 'SkillResource',
  SkillMcpConfig = 'SkillMcpConfig',
  Readme = 'Readme',
  Rule = 'Rule'
}

/**
 * Scope for rule application
 */
export type RuleScope = 'project' | 'global'

export enum ClaudeCodeCLISubAgentColors {
  Red = 'Red',
  Green = 'Green',
  Blue = 'Blue',
  Yellow = 'Yellow'
}

/**
 * Tools callable by AI Agent
 */
export enum CodingAgentTools {
  Read = 'Read',
  Write = 'Write',
  Edit = 'Edit',
  Grep = 'Grep'
}

/**
 * Naming convention
 */
export enum NamingCaseKind {
  CamelCase = 'CamelCase',
  PascalCase = 'PascalCase',
  SnakeCase = 'SnakeCase',
  KebabCase = 'KebabCase',
  UpperCase = 'UpperCase',
  LowerCase = 'LowerCase',
  Original = 'Original'
}

export enum GlobalConfigDirectoryType {
  UserHome = 'UserHome',
  External = 'External'
}

/**
 * Directory path kind
 */
export enum FilePathKind {
  Relative = 'Relative',
  Absolute = 'Absolute',
  Root = 'Root'
}

export enum IDEKind {
  VSCode = 'VSCode',
  IntellijIDEA = 'IntellijIDEA',
  Git = 'Git',
  EditorConfig = 'EditorConfig',
  Original = 'Original'
}
