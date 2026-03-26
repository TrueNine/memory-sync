/**
 * Aindex directory structure types and constants
 * Used for directory structure validation and generation
 */

/**
 * File entry in the aindex project
 */
export interface AindexFileEntry {
  /** File name (e.g., 'GLOBAL.md') */
  readonly name: string;
  /** Whether this file is required */
  readonly required: boolean;
  /** File description */
  readonly description?: string;
}

/**
 * Directory entry in the aindex project
 */
export interface AindexDirectoryEntry {
  /** Directory name (e.g., 'skills') */
  readonly name: string;
  /** Whether this directory is required */
  readonly required: boolean;
  /** Directory description */
  readonly description?: string;
  /** Nested directories */
  readonly directories?: readonly AindexDirectoryEntry[];
  /** Files in this directory */
  readonly files?: readonly AindexFileEntry[];
}

/**
 * Root structure of the aindex project
 */
export interface AindexDirectory {
  /** Source directories (before compilation) */
  readonly src: {
    readonly skills: AindexDirectoryEntry;
    readonly commands: AindexDirectoryEntry;
    readonly agents: AindexDirectoryEntry;
    readonly rules: AindexDirectoryEntry;
    readonly globalMemoryFile: AindexFileEntry;
    readonly workspaceMemoryFile: AindexFileEntry;
  };
  /** Distribution directories (after compilation) */
  readonly dist: {
    readonly skills: AindexDirectoryEntry;
    readonly commands: AindexDirectoryEntry;
    readonly agents: AindexDirectoryEntry;
    readonly rules: AindexDirectoryEntry;
    readonly app: AindexDirectoryEntry;
    readonly globalMemoryFile: AindexFileEntry;
    readonly workspaceMemoryFile: AindexFileEntry;
  };
  /** App directory (project-specific prompts source, standalone at root) */
  readonly app: AindexDirectoryEntry;
  /** IDE configuration directories */
  readonly ide: {
    readonly idea: AindexDirectoryEntry;
    readonly ideaCodeStyles: AindexDirectoryEntry;
    readonly vscode: AindexDirectoryEntry;
    readonly zed: AindexDirectoryEntry;
  };
  /** IDE configuration files */
  readonly ideFiles: readonly AindexFileEntry[];
  /** AI Agent ignore files */
  readonly ignoreFiles: readonly AindexFileEntry[];
}

/**
 * Directory names used in aindex project
 */
export const AINDEX_DIR_NAMES = {
  SRC: "src",
  DIST: "dist",
  SKILLS: "skills",
  COMMANDS: "commands",
  AGENTS: "agents",
  RULES: "rules",
  APP: "app",
  IDEA: ".idea", // IDE directories
  IDEA_CODE_STYLES: ".idea/codeStyles",
  VSCODE: ".vscode",
  ZED: ".zed",
} as const;

/**
 * File names used in aindex project
 */
export const AINDEX_FILE_NAMES = {
  GLOBAL_MEMORY: "global.mdx", // Global memory
  GLOBAL_MEMORY_SRC: "global.src.mdx",
  WORKSPACE_MEMORY: "workspace.mdx", // Workspace memory
  WORKSPACE_MEMORY_SRC: "workspace.src.mdx",
  EDITOR_CONFIG: ".editorconfig", // EditorConfig
  IDEA_GITIGNORE: ".idea/.gitignore", // JetBrains IDE
  IDEA_PROJECT_XML: ".idea/codeStyles/Project.xml",
  IDEA_CODE_STYLE_CONFIG_XML: ".idea/codeStyles/codeStyleConfig.xml",
  VSCODE_SETTINGS: ".vscode/settings.json", // VS Code
  VSCODE_EXTENSIONS: ".vscode/extensions.json",
  ZED_SETTINGS: ".zed/settings.json",
  QODER_IGNORE: ".qoderignore", // AI Agent ignore files
  CURSOR_IGNORE: ".cursorignore",
  WARP_INDEX_IGNORE: ".warpindexignore",
  AI_IGNORE: ".aiignore",
  CODEIUM_IGNORE: ".codeiumignore", // Windsurf ignore file
} as const;

/**
 * Relative paths from aindex project root
 */
export const AINDEX_RELATIVE_PATHS = {
  SRC_SKILLS: "src/skills", // Source paths
  SRC_COMMANDS: "src/commands",
  SRC_AGENTS: "src/agents",
  SRC_RULES: "src/rules",
  SRC_GLOBAL_MEMORY: "app/global.src.mdx",
  SRC_WORKSPACE_MEMORY: "app/workspace.src.mdx",
  DIST_SKILLS: "dist/skills", // Distribution paths
  DIST_COMMANDS: "dist/commands",
  DIST_AGENTS: "dist/agents",
  DIST_RULES: "dist/rules",
  DIST_APP: "dist/app",
  DIST_GLOBAL_MEMORY: "dist/global.mdx",
  DIST_WORKSPACE_MEMORY: "dist/workspace.mdx",
  APP: "app", // App source path (standalone at root)
} as const;

/**
 * Default aindex directory structure
 * Used for validation and generation
 */
export const DEFAULT_AINDEX_STRUCTURE: AindexDirectory = {
  src: {
    skills: {
      name: AINDEX_DIR_NAMES.SKILLS,
      required: false,
      description: "Skill source files (.src.mdx)",
    },
    commands: {
      name: AINDEX_DIR_NAMES.COMMANDS,
      required: false,
      description: "Fast command source files (.src.mdx)",
    },
    agents: {
      name: AINDEX_DIR_NAMES.AGENTS,
      required: false,
      description: "Sub-agent source files (.src.mdx)",
    },
    rules: {
      name: AINDEX_DIR_NAMES.RULES,
      required: false,
      description: "Rule source files (.src.mdx)",
    },
    globalMemoryFile: {
      name: AINDEX_FILE_NAMES.GLOBAL_MEMORY_SRC,
      required: false,
      description: "Global memory source file",
    },
    workspaceMemoryFile: {
      name: AINDEX_FILE_NAMES.WORKSPACE_MEMORY_SRC,
      required: false,
      description: "Workspace memory source file",
    },
  },
  dist: {
    skills: {
      name: AINDEX_DIR_NAMES.SKILLS,
      required: false,
      description: "Compiled skill files (.mdx)",
    },
    commands: {
      name: AINDEX_DIR_NAMES.COMMANDS,
      required: false,
      description: "Compiled fast command files (.mdx)",
    },
    agents: {
      name: AINDEX_DIR_NAMES.AGENTS,
      required: false,
      description: "Compiled sub-agent files (.mdx)",
    },
    rules: {
      name: AINDEX_DIR_NAMES.RULES,
      required: false,
      description: "Compiled rule files (.mdx)",
    },
    globalMemoryFile: {
      name: AINDEX_FILE_NAMES.GLOBAL_MEMORY,
      required: false,
      description: "Compiled global memory file",
    },
    workspaceMemoryFile: {
      name: AINDEX_FILE_NAMES.WORKSPACE_MEMORY,
      required: false,
      description: "Compiled workspace memory file",
    },
    app: {
      name: AINDEX_DIR_NAMES.APP,
      required: false,
      description: "Compiled project-specific prompts",
    },
  },
  app: {
    name: AINDEX_DIR_NAMES.APP,
    required: false,
    description: "Project-specific prompts (standalone directory)",
  },
  ide: {
    idea: {
      name: AINDEX_DIR_NAMES.IDEA,
      required: false,
      description: "JetBrains IDE configuration directory",
    },
    ideaCodeStyles: {
      name: AINDEX_DIR_NAMES.IDEA_CODE_STYLES,
      required: false,
      description: "JetBrains IDE code styles directory",
    },
    vscode: {
      name: AINDEX_DIR_NAMES.VSCODE,
      required: false,
      description: "VS Code configuration directory",
    },
    zed: {
      name: AINDEX_DIR_NAMES.ZED,
      required: false,
      description: "Zed configuration directory",
    },
  },
  ideFiles: [
    {
      name: AINDEX_FILE_NAMES.EDITOR_CONFIG,
      required: false,
      description: "EditorConfig file",
    },
    {
      name: AINDEX_FILE_NAMES.IDEA_GITIGNORE,
      required: false,
      description: "JetBrains IDE .gitignore",
    },
    {
      name: AINDEX_FILE_NAMES.IDEA_PROJECT_XML,
      required: false,
      description: "JetBrains IDE Project.xml",
    },
    {
      name: AINDEX_FILE_NAMES.IDEA_CODE_STYLE_CONFIG_XML,
      required: false,
      description: "JetBrains IDE codeStyleConfig.xml",
    },
    {
      name: AINDEX_FILE_NAMES.VSCODE_SETTINGS,
      required: false,
      description: "VS Code settings.json",
    },
    {
      name: AINDEX_FILE_NAMES.VSCODE_EXTENSIONS,
      required: false,
      description: "VS Code extensions.json",
    },
    {
      name: AINDEX_FILE_NAMES.ZED_SETTINGS,
      required: false,
      description: "Zed settings.json",
    },
  ],
  ignoreFiles: [
    {
      name: AINDEX_FILE_NAMES.QODER_IGNORE,
      required: false,
      description: "Qoder ignore file",
    },
    {
      name: AINDEX_FILE_NAMES.CURSOR_IGNORE,
      required: false,
      description: "Cursor ignore file",
    },
    {
      name: AINDEX_FILE_NAMES.WARP_INDEX_IGNORE,
      required: false,
      description: "Warp index ignore file",
    },
    {
      name: AINDEX_FILE_NAMES.AI_IGNORE,
      required: false,
      description: "AI ignore file",
    },
    {
      name: AINDEX_FILE_NAMES.CODEIUM_IGNORE,
      required: false,
      description: "Windsurf ignore file",
    },
  ],
} as const;

/**
 * Type for directory names
 */
export type AindexDirName =
  (typeof AINDEX_DIR_NAMES)[keyof typeof AINDEX_DIR_NAMES];

/**
 * Type for file names
 */
export type AindexFileName =
  (typeof AINDEX_FILE_NAMES)[keyof typeof AINDEX_FILE_NAMES];

/**
 * Type for relative paths
 */
export type AindexRelativePath =
  (typeof AINDEX_RELATIVE_PATHS)[keyof typeof AINDEX_RELATIVE_PATHS];
