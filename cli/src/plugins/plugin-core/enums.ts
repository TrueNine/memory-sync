export enum PluginKind {
  Output = "output",
}

export enum PromptKind {
  GlobalMemory = "globalMemory",
  ProjectRootMemory = "projectRootMemory",
  ProjectChildrenMemory = "projectChildrenMemory",
  Command = "command",
  SubAgent = "subAgent",
  Skill = "skill",
  SkillChildDoc = "skillChildDoc",
  SkillResource = "skillResource",
  SkillMcpConfig = "skillMcpConfig",
  Readme = "readme",
  Rule = "rule",
}

export type RuleScope = "project" | "global";

export enum FilePathKind {
  Relative = "relative",
  Absolute = "absolute",
  Root = "root",
}

export enum IDEKind {
  VSCode = "vscode",
  Zed = "zed",
  IntellijIDEA = "intellijIdea",
  Git = "git",
  EditorConfig = "editorconfig",
  Original = "original",
}

export enum NamingCaseKind {
  CamelCase = "camelCase",
  PascalCase = "pascalCase",
  SnakeCase = "snakeCase",
  KebabCase = "kebabCase",
  UpperCase = "upperCase",
  LowerCase = "lowerCase",
  Original = "original",
}

export enum GlobalConfigDirectoryType {
  UserHome = "userHome",
  External = "external",
}

export type CodingAgentTools = string;

export type ClaudeCodeCLISubAgentColors = string;
