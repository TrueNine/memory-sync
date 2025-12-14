export enum PluginKind {
  Input = 'Input',
  Output = 'Output',
}

export enum PromptKind {
  GlobalMemory = 'GlobalMemory',
  ProjectRootMemory = 'ProjectRootMemory',
  ProjectChildrenMemory = 'ProjectChildrenMemory',
  FastCommand = 'FastCommand',
  SubAgent = 'SubAgent',
  Skill = 'Skill',
  SkillReferenceDocument = 'SkillReferenceDocument',
}

export enum ClaudeCodeCLISubAgentColors {
  Red = 'Red',
  Green = 'Green',
  Blue = 'Blue',
  Yellow = 'Yellow',
}

/**
 * AI Agent 可调用的工具
 */
export enum CodingAgentTools {
  Read = 'Read',
  Write = 'Write',
  Edit = 'Edit',
  Grep = 'Grep',
}

/**
 * 命名方式
 */
export enum NamingCaseKind {
  CamelCase = 'CamelCase',
  PascalCase = 'PascalCase',
  SnakeCase = 'SnakeCase',
  KebabCase = 'KebabCase',
  UpperCase = 'UpperCase',
  LowerCase = 'LowerCase',
  Original = 'Original',
}

export enum GlobalConfigDirectoryType {
  UserHome = 'UserHome',
  External = 'External',
}

/**
 * 目录路径类型
 */
export enum FilePathKind {
  /**
   * 相对于某个基准的路径
   */
  Relative = 'Relative',
  /**
   * 绝对路径
   */
  Absolute = 'Absolute',
  /**
   * 空路径，表示当前工作目录
   */
  Empty = 'Empty',
}

export enum IDEKind {
  VSCode = 'VSCode',
  IntellijIDEA = 'IntellijIDEA',
  Git = 'Git',
  EditorConfig = 'EditorConfig',
  /**
   * 通用类型
   */
  Original = 'Original',
}
