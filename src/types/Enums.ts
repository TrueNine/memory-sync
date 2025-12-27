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
  /**
   * Skill child document (.md files in any subdirectory)
   */
  SkillChildDoc = 'SkillChildDoc',
  /**
   * Skill resource file for AI on-demand access
   * Includes code files, binary files, images, data files, etc.
   * Any non-.md file in skill directory or subdirectories
   */
  SkillResource = 'SkillResource',
  /**
   * Skill MCP configuration file (mcp.json)
   * - Kiro: supports per-power MCP configuration
   * - Others: may support lazy loading in the future
   */
  SkillMcpConfig = 'SkillMcpConfig',
  Readme = 'Readme',
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
   * 根路径，表示基于某个目录的根节点直接依附
   */
  Root = 'Root',
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
