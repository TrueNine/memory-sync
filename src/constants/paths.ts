import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * User home directory (normalized for Windows)
 */
export const USER_HOME = process.platform === 'win32'
  ? os.homedir().replace(/\\/g, '/')
  : os.homedir()

/**
 * User projects base directory: ~/project/
 */
export const USER_PROJECTS_DIR = path.join(USER_HOME, 'project')

// ============================================================================
// Path Builder Pattern
// ============================================================================

/**
 * Project path configuration for PathBuilder
 */
export interface ProjectPathConfig {
  /**
   * Project root directory
   */
  root: string
}

/**
 * PathBuilder - Builder pattern for constructing project paths
 * Provides platform-independent, structured access to project directories
 *
 * @example
 * ```typescript
 * const paths = new PathBuilder({ root: '/path/to/project' })
 * const distDir = paths.dist()
 * const kiroSteering = paths.kiro().steering()
 * const claudeCommands = paths.claude().commands()
 * ```
 */
export class PathBuilder {
  private readonly config: ProjectPathConfig

  constructor(config: ProjectPathConfig) {
    this.config = config
  }

  /**
   * Get project root directory
   */
  root(): string {
    return this.config.root
  }

  /**
   * Get dist directory path
   */
  dist(): string {
    return path.join(this.config.root, 'dist')
  }

  /**
   * Get ref directory path
   */
  ref(): string {
    return path.join(this.config.root, 'ref')
  }

  /**
   * Get Claude-related paths
   */
  claude(): ClaudePathBuilder {
    return new ClaudePathBuilder(this.config.root)
  }

  /**
   * Get Factory-related paths
   */
  factory(): FactoryPathBuilder {
    return new FactoryPathBuilder(this.config.root)
  }

  /**
   * Get Kiro-related paths
   */
  kiro(): KiroPathBuilder {
    return new KiroPathBuilder(this.config.root)
  }

  /**
   * Get Qoder-related paths
   */
  qoder(): QoderPathBuilder {
    return new QoderPathBuilder(this.config.root)
  }

  /**
   * Get Codebuddy-related paths
   */
  codebuddy(): CodebuddyPathBuilder {
    return new CodebuddyPathBuilder(this.config.root)
  }

  /**
   * Get Agent-related paths (Antigravity)
   */
  agent(): AgentPathBuilder {
    return new AgentPathBuilder(this.config.root)
  }

  /**
   * Resolve arbitrary path segments relative to project root
   */
  resolve(...segments: string[]): string {
    return path.join(this.config.root, ...segments)
  }

  /**
   * Create a PathBuilder for a specific project within USER_PROJECTS_DIR
   */
  static forProject(projectName: string): PathBuilder {
    return new PathBuilder({
      root: path.join(USER_PROJECTS_DIR, projectName),
    })
  }

  /**
   * Create a PathBuilder from an absolute path
   */
  static fromPath(absolutePath: string): PathBuilder {
    return new PathBuilder({ root: absolutePath })
  }
}

/**
 * Claude path builder for Claude Code CLI paths
 */
export class ClaudePathBuilder {
  private readonly baseDir: string

  constructor(projectRoot: string) {
    this.baseDir = path.join(projectRoot, '.claude')
  }

  /**
   * Get .claude directory path
   */
  root(): string {
    return this.baseDir
  }

  /**
   * Get skills directory path
   */
  skills(): string {
    return path.join(this.baseDir, 'skills')
  }

  /**
   * Get commands directory path
   */
  commands(): string {
    return path.join(this.baseDir, 'commands')
  }

  /**
   * Get agents directory path
   */
  agents(): string {
    return path.join(this.baseDir, 'agents')
  }
}

/**
 * Factory path builder for Factory Droid CLI paths
 */
export class FactoryPathBuilder {
  private readonly baseDir: string

  constructor(projectRoot: string) {
    this.baseDir = path.join(projectRoot, '.factory')
  }

  /**
   * Get .factory directory path
   */
  root(): string {
    return this.baseDir
  }

  /**
   * Get skills directory path
   */
  skills(): string {
    return path.join(this.baseDir, 'skills')
  }

  /**
   * Get commands directory path
   */
  commands(): string {
    return path.join(this.baseDir, 'commands')
  }
}

/**
 * Kiro path builder for Kiro IDE paths
 */
export class KiroPathBuilder {
  private readonly baseDir: string

  constructor(projectRoot: string) {
    this.baseDir = path.join(projectRoot, '.kiro')
  }

  /**
   * Get .kiro directory path
   */
  root(): string {
    return this.baseDir
  }

  /**
   * Get steering directory path
   */
  steering(): string {
    return path.join(this.baseDir, 'steering')
  }

  /**
   * Get global Kiro steering directory (user home)
   */
  static globalSteering(): string {
    return path.join(USER_HOME, '.kiro', 'steering')
  }
}

/**
 * Qoder path builder for Qoder IDE paths
 */
export class QoderPathBuilder {
  private readonly baseDir: string

  constructor(projectRoot: string) {
    this.baseDir = path.join(projectRoot, '.qoder')
  }

  /**
   * Get .qoder directory path
   */
  root(): string {
    return this.baseDir
  }

  /**
   * Get rules directory path
   */
  rules(): string {
    return path.join(this.baseDir, 'rules')
  }
}

/**
 * Codebuddy path builder for Codebuddy IDE paths
 */
export class CodebuddyPathBuilder {
  private readonly baseDir: string

  constructor(projectRoot: string) {
    this.baseDir = path.join(projectRoot, '.codebuddy')
  }

  /**
   * Get .codebuddy directory path
   */
  root(): string {
    return this.baseDir
  }

  /**
   * Get rules directory path
   */
  rules(): string {
    return path.join(this.baseDir, '.rules')
  }
}

/**
 * Agent path builder for Antigravity paths
 */
export class AgentPathBuilder {
  private readonly baseDir: string

  constructor(projectRoot: string) {
    this.baseDir = path.join(projectRoot, '.agent')
  }

  /**
   * Get .agent directory path
   */
  root(): string {
    return this.baseDir
  }

  /**
   * Get rules directory path
   */
  rules(): string {
    return path.join(this.baseDir, 'rules')
  }

  /**
   * Get workflows directory path
   */
  workflows(): string {
    return path.join(this.baseDir, 'workflows')
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Helper function to get Claude skills directory for a project
 */
export function getClaudeSkillsDir(projectRoot: string): string {
  return new PathBuilder({ root: projectRoot }).claude().skills()
}

/**
 * Helper function to get Factory skills directory for a project
 */
export function getFactorySkillsDir(projectRoot: string): string {
  return new PathBuilder({ root: projectRoot }).factory().skills()
}

/**
 * Get project-specific exclude patterns
 * @param _projectName - The name of the project (reserved for future use)
 * @returns Array of exclude patterns for the project
 */
export function getProjectExcludePatterns(_projectName: string): readonly string[] {
  // Default exclude patterns for any project
  const defaultPatterns = ['ref/*/dist'] as const
  return defaultPatterns
}
