/**
 * Shadow Source Project (aindex) directory structure types and constants
 * Used for directory structure validation and generation
 */

/**
 * File entry in the shadow source project
 */
export interface ShadowSourceFileEntry {
  /** File name (e.g., 'GLOBAL.md') */
  readonly name: string
  /** Whether this file is required */
  readonly required: boolean
  /** File description */
  readonly description?: string
}

/**
 * Directory entry in the shadow source project
 */
export interface ShadowSourceDirectoryEntry {
  /** Directory name (e.g., 'skills') */
  readonly name: string
  /** Whether this directory is required */
  readonly required: boolean
  /** Directory description */
  readonly description?: string
  /** Nested directories */
  readonly directories?: readonly ShadowSourceDirectoryEntry[]
  /** Files in this directory */
  readonly files?: readonly ShadowSourceFileEntry[]
}

/**
 * Root structure of the shadow source project
 */
export interface ShadowSourceProjectDirectory {
  /** Source directories (before compilation) */
  readonly src: {
    readonly skills: ShadowSourceDirectoryEntry
    readonly commands: ShadowSourceDirectoryEntry
    readonly agents: ShadowSourceDirectoryEntry
    readonly globalMemoryFile: ShadowSourceFileEntry
  }
  /** Distribution directories (after compilation) */
  readonly dist: {
    readonly skills: ShadowSourceDirectoryEntry
    readonly commands: ShadowSourceDirectoryEntry
    readonly agents: ShadowSourceDirectoryEntry
    readonly app: ShadowSourceDirectoryEntry
    readonly globalMemoryFile: ShadowSourceFileEntry
  }
  /** App directory (project-specific prompts source, standalone at root) */
  readonly app: ShadowSourceDirectoryEntry
  /** IDE configuration directories */
  readonly ide: {
    readonly idea: ShadowSourceDirectoryEntry
    readonly ideaCodeStyles: ShadowSourceDirectoryEntry
    readonly vscode: ShadowSourceDirectoryEntry
  }
  /** IDE configuration files */
  readonly ideFiles: readonly ShadowSourceFileEntry[]
  /** AI Agent ignore files */
  readonly ignoreFiles: readonly ShadowSourceFileEntry[]
}

/**
 * Directory names used in shadow source project
 */
export const SHADOW_SOURCE_DIR_NAMES = {
  SRC: 'src',
  DIST: 'dist',
  SKILLS: 'skills',
  COMMANDS: 'commands',
  AGENTS: 'agents',
  APP: 'app',
  IDEA: '.idea', // IDE directories
  IDEA_CODE_STYLES: '.idea/codeStyles',
  VSCODE: '.vscode'
} as const

/**
 * File names used in shadow source project
 */
export const SHADOW_SOURCE_FILE_NAMES = {
  GLOBAL_MEMORY: 'global.mdx', // Global memory
  GLOBAL_MEMORY_SRC: 'global.cn.mdx',
  EDITOR_CONFIG: '.editorconfig', // EditorConfig
  IDEA_GITIGNORE: '.idea/.gitignore', // JetBrains IDE
  IDEA_PROJECT_XML: '.idea/codeStyles/Project.xml',
  IDEA_CODE_STYLE_CONFIG_XML: '.idea/codeStyles/codeStyleConfig.xml',
  VSCODE_SETTINGS: '.vscode/settings.json', // VS Code
  VSCODE_EXTENSIONS: '.vscode/extensions.json',
  QODER_IGNORE: '.qoderignore', // AI Agent ignore files
  CURSOR_IGNORE: '.cursorignore',
  WARP_INDEX_IGNORE: '.warpindexignore',
  AI_IGNORE: '.aiignore'
} as const

/**
 * Relative paths from shadow source project root
 */
export const SHADOW_SOURCE_RELATIVE_PATHS = {
  SRC_SKILLS: 'src/skills', // Source paths
  SRC_COMMANDS: 'src/commands',
  SRC_AGENTS: 'src/agents',
  SRC_GLOBAL_MEMORY: 'app/global.cn.mdx',
  DIST_SKILLS: 'dist/skills', // Distribution paths
  DIST_COMMANDS: 'dist/commands',
  DIST_AGENTS: 'dist/agents',
  DIST_APP: 'dist/app',
  DIST_GLOBAL_MEMORY: 'dist/global.mdx',
  APP: 'app' // App source path (standalone at root)
} as const

/**
 * Default shadow source project directory structure
 * Used for validation and generation
 */
export const DEFAULT_SHADOW_SOURCE_PROJECT_STRUCTURE: ShadowSourceProjectDirectory = {
  src: {
    skills: {
      name: SHADOW_SOURCE_DIR_NAMES.SKILLS,
      required: false,
      description: 'Skill source files (.cn.mdx)'
    },
    commands: {
      name: SHADOW_SOURCE_DIR_NAMES.COMMANDS,
      required: false,
      description: 'Fast command source files (.cn.mdx)'
    },
    agents: {
      name: SHADOW_SOURCE_DIR_NAMES.AGENTS,
      required: false,
      description: 'Sub-agent source files (.cn.mdx)'
    },
    globalMemoryFile: {
      name: SHADOW_SOURCE_FILE_NAMES.GLOBAL_MEMORY_SRC,
      required: false,
      description: 'Global memory source file'
    }
  },
  dist: {
    skills: {
      name: SHADOW_SOURCE_DIR_NAMES.SKILLS,
      required: false,
      description: 'Compiled skill files (.mdx)'
    },
    commands: {
      name: SHADOW_SOURCE_DIR_NAMES.COMMANDS,
      required: false,
      description: 'Compiled fast command files (.mdx)'
    },
    agents: {
      name: SHADOW_SOURCE_DIR_NAMES.AGENTS,
      required: false,
      description: 'Compiled sub-agent files (.mdx)'
    },
    globalMemoryFile: {
      name: SHADOW_SOURCE_FILE_NAMES.GLOBAL_MEMORY,
      required: false,
      description: 'Compiled global memory file'
    },
    app: {
      name: SHADOW_SOURCE_DIR_NAMES.APP,
      required: false,
      description: 'Compiled project-specific prompts'
    }
  },
  app: {
    name: SHADOW_SOURCE_DIR_NAMES.APP,
    required: false,
    description: 'Project-specific prompts (standalone directory)'
  },
  ide: {
    idea: {
      name: SHADOW_SOURCE_DIR_NAMES.IDEA,
      required: false,
      description: 'JetBrains IDE configuration directory'
    },
    ideaCodeStyles: {
      name: SHADOW_SOURCE_DIR_NAMES.IDEA_CODE_STYLES,
      required: false,
      description: 'JetBrains IDE code styles directory'
    },
    vscode: {
      name: SHADOW_SOURCE_DIR_NAMES.VSCODE,
      required: false,
      description: 'VS Code configuration directory'
    }
  },
  ideFiles: [
    {
      name: SHADOW_SOURCE_FILE_NAMES.EDITOR_CONFIG,
      required: false,
      description: 'EditorConfig file'
    },
    {
      name: SHADOW_SOURCE_FILE_NAMES.IDEA_GITIGNORE,
      required: false,
      description: 'JetBrains IDE .gitignore'
    },
    {
      name: SHADOW_SOURCE_FILE_NAMES.IDEA_PROJECT_XML,
      required: false,
      description: 'JetBrains IDE Project.xml'
    },
    {
      name: SHADOW_SOURCE_FILE_NAMES.IDEA_CODE_STYLE_CONFIG_XML,
      required: false,
      description: 'JetBrains IDE codeStyleConfig.xml'
    },
    {
      name: SHADOW_SOURCE_FILE_NAMES.VSCODE_SETTINGS,
      required: false,
      description: 'VS Code settings.json'
    },
    {
      name: SHADOW_SOURCE_FILE_NAMES.VSCODE_EXTENSIONS,
      required: false,
      description: 'VS Code extensions.json'
    }
  ],
  ignoreFiles: [
    {
      name: SHADOW_SOURCE_FILE_NAMES.QODER_IGNORE,
      required: false,
      description: 'Qoder ignore file'
    },
    {
      name: SHADOW_SOURCE_FILE_NAMES.CURSOR_IGNORE,
      required: false,
      description: 'Cursor ignore file'
    },
    {
      name: SHADOW_SOURCE_FILE_NAMES.WARP_INDEX_IGNORE,
      required: false,
      description: 'Warp index ignore file'
    },
    {
      name: SHADOW_SOURCE_FILE_NAMES.AI_IGNORE,
      required: false,
      description: 'AI ignore file'
    }
  ]
} as const

/**
 * Type for directory names
 */
export type ShadowSourceDirName = (typeof SHADOW_SOURCE_DIR_NAMES)[keyof typeof SHADOW_SOURCE_DIR_NAMES]

/**
 * Type for file names
 */
export type ShadowSourceFileName = (typeof SHADOW_SOURCE_FILE_NAMES)[keyof typeof SHADOW_SOURCE_FILE_NAMES]

/**
 * Type for relative paths
 */
export type ShadowSourceRelativePath = (typeof SHADOW_SOURCE_RELATIVE_PATHS)[keyof typeof SHADOW_SOURCE_RELATIVE_PATHS]
