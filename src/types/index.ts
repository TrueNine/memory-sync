/**
 * Configuration for TrueNine project
 */
export interface TrueNineConfig {
  /**
   * Project name
   */
  projectName: string
  /**
   * Project author
   */
  author: string
  /**
   * Project description
   */
  description: string
  /**
   * Project version
   */
  version: string
  /**
   * Prompt-related settings
   */
  promptSettings: {
    /**
     * Whether to automatically build prompts
     */
    autoBuild: boolean
    /**
     * Whether to build prompts on file save
     */
    buildOnSave: boolean
    /**
     * Output format for prompts
     */
    outputFormat: 'markdown' | 'json' | 'yaml'
  }
  /**
   * Project-level settings
   */
  projectSettings: {
    /**
     * Whether to automatically sync files
     */
    autoSync: boolean
    /**
     * Whether to validate project structure
     */
    validateStructure: boolean
  }
}

/**
 * Options for project initialization
 */
export interface InitOptions {
  /**
   * Project name (optional)
   */
  projectName?: string
  /**
   * Project author (optional)
   */
  author?: string
  /**
   * Project description (optional)
   */
  description?: string
  /**
   * Whether to skip git initialization
   */
  skipGit?: boolean
}

/**
 * Information about a prompt file
 */
export interface PromptFile {
  /**
   * File name
   */
  name: string
  /**
   * Full file path
   */
  path: string
  /**
   * File size in bytes
   */
  size: number
  /**
   * Last modified date
   */
  modified: Date
}

/**
 * Project selection information
 */
export interface ProjectSelection {
  /**
   * Path to airef directory
   */
  airefPath: string
  /**
   * Selected project directories
   */
  selectedDirs: string[]
}

/**
 * Target configuration for prompt deployment
 */
export interface PromptTarget {
  /**
   * Display label for the target
   */
  label: string
  /**
   * Path segments to construct target path
   */
  segments: readonly string[]
}

/**
 * Configuration for exporting prompt directories
 */
export interface PromptDirectoryExport {
  /**
   * Display label for the export
   */
  label: string
  /**
   * Source path segments
   */
  sourceSegments: readonly string[]
  /**
   * Target path segments
   */
  targetSegments: readonly string[]
}

/**
 * Configuration for supporting artifacts (files/directories)
 */
export interface SupportArtifact {
  /**
   * Display label for the artifact
   */
  label: string
  /**
   * Type of artifact (directory or file)
   */
  type: 'directory' | 'file'
  /**
   * Source path segments
   */
  sourceSegments: readonly string[]
  /**
   * Target path segments
   */
  targetSegments: readonly string[]
  /**
   * Files to ignore during copy (optional)
   */
  ignore?: readonly string[]
}
