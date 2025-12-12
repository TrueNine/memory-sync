/**
 * Plugin context implementation
 * Provides shared utilities and state for plugins during execution
 */

import type { Dirent } from 'node:fs'
import type {
  EmittedFile,
  InputBundle,
  InputType,
  PluginConfig,
  PluginContext,
  PluginFileSystem,
  PluginGlob,
  PluginLog,
  PluginMode,
  PluginOutput,
  PluginPaths,
  PluginRegistry,
  PluginSystemConfig,
  PluginTargets,
  ResolvedOutputPaths,
  SystemCapabilities,
} from './types'
import type { LogAdapter } from '@/log'
import os from 'node:os'
import path from 'node:path'
import { glob } from 'fast-glob'
import fs from 'fs-extra'
import { PathBuilder } from '@/constants'
import logger from '../logger'
import {
  createBlankLineCleanerCapability,
  createCodeBlockTransformCapability,
  createContentInjectionCapability,
  createFrontMatterCapability,
  createMarkdownCapability,
} from './capabilities'
import { createDryRunOperation, createDryRunTracker } from './DryRunTracker'
import { resolvePathVariables } from './PathResolver'
import { createPluginRegistry } from './PluginRegistry'
import { ClassificationService } from './services/ClassificationService'


/**
 * Create plugin log interface (Requirements 12.5, 12.6, 12.7)
 * ONLY allowed logging method for plugins
 */
function createPluginLog(): PluginLog {
  return {
    debug: (message: string, ...args: unknown[]) => {
      logger.debug(message, { args })
    },
    info: (message: string, ...args: unknown[]) => {
      logger.info(message, { args })
    },
    warn: (message: string, ...args: unknown[]) => {
      logger.warn(message, { args })
    },
    error: (message: string, ...args: unknown[]) => {
      logger.error(message, { args })
    },
  }
}

/**
 * Create file system utilities for plugins (Requirements 6.5, 13.1, 21.1, 21.2)
 * When dryRun is true, simulates operations without writing to disk
 * and tracks all operations via the dryRunTracker
 *
 * @param mode - The plugin mode, including dryRun status and tracker
 * @returns PluginFileSystem utilities
 */
function createFileSystem(
  mode: PluginMode,
): PluginFileSystem {
  const { dryRun, dryRunTracker } = mode

  return {
    readFile: async (filePath: string): Promise<string> => {
      return fs.readFile(filePath, 'utf-8')
    },
    writeFile: async (filePath: string, content: string): Promise<void> => {
      if (dryRun) {
        // Check if file exists to determine create vs modify (Requirement 21.2)
        const exists = await fs.pathExists(filePath)
        const operationType = exists ? 'modify' : 'create'

        logger.info(`[dry-run] Would ${operationType} file: ${filePath}`)

        // Track the operation (Requirement 21.2)
        if (dryRunTracker != null) {
          dryRunTracker.record(createDryRunOperation(operationType, filePath))
        }
        return
      }
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeFile(filePath, content, 'utf-8')
    },
    exists: async (filePath: string): Promise<boolean> => {
      return fs.pathExists(filePath)
    },
    ensureDir: async (dirPath: string): Promise<void> => {
      if (dryRun) {
        // Check if directory exists (Requirement 21.2)
        const exists = await fs.pathExists(dirPath)
        if (!exists) {
          logger.info(`[dry-run] Would create directory: ${dirPath}`)

          // Track the operation (Requirement 21.2)
          if (dryRunTracker != null) {
            dryRunTracker.record(createDryRunOperation('ensureDir', dirPath))
          }
        }
        return
      }
      await fs.ensureDir(dirPath)
    },
    copy: async (src: string, dest: string): Promise<void> => {
      if (dryRun) {
        logger.info(`[dry-run] Would copy: ${src} -> ${dest}`)

        // Track the operation (Requirement 21.2)
        if (dryRunTracker != null) {
          dryRunTracker.record(createDryRunOperation('copy', dest, src))
        }
        return
      }
      await fs.ensureDir(path.dirname(dest))
      await fs.copy(src, dest)
    },
    remove: async (targetPath: string): Promise<void> => {
      if (dryRun) {
        // Check if path exists before logging (Requirement 21.2)
        const exists = await fs.pathExists(targetPath)
        if (exists) {
          logger.info(`[dry-run] Would delete: ${targetPath}`)

          // Track the operation (Requirement 21.2)
          if (dryRunTracker != null) {
            dryRunTracker.record(createDryRunOperation('delete', targetPath))
          }
        }
        return
      }
      await fs.remove(targetPath)
    },
    cleanDir: async (dirPath: string): Promise<void> => {
      if (dryRun) {
        // Check if directory exists (Requirement 21.2)
        const exists = await fs.pathExists(dirPath)
        if (exists) {
          logger.info(`[dry-run] Would clean directory: ${dirPath}`)

          // Track the operation (Requirement 21.2)
          if (dryRunTracker != null) {
            dryRunTracker.record(createDryRunOperation('cleanDir', dirPath))
          }
        }
        return
      }
      await fs.emptyDir(dirPath)
    },
    stat: async (filePath: string) => {
      const stats = await fs.stat(filePath)
      return {
        isDirectory: () => stats.isDirectory(),
        isFile: () => stats.isFile(),
        size: stats.size,
        mtime: stats.mtime,
      }
    },
    readdir: async (dirPath: string, options?: { withFileTypes?: boolean }) => {
      // Explicitly handle the two return types of readdir
      if (options?.withFileTypes) {
        const files = fs.readdirSync(dirPath, { withFileTypes: true }) as unknown as Dirent[]
        return files.map((f) => ({
          name: f.name,
          isDirectory: () => f.isDirectory(),
        }))
      } else {
        return await fs.readdir(dirPath) as unknown as string[]
      }
    },
    async readJson<T = unknown>(filePath: string): Promise<T> {
      return await fs.readJson(filePath) as T
    },

    async lstat(filePath: string) {
      const stats = await fs.lstat(filePath)
      return {
        isSymbolicLink: () => stats.isSymbolicLink(),
        isDirectory: () => stats.isDirectory(),
        isFile: () => stats.isFile(),
      }
    },

    async readlink(filePath: string): Promise<string> {
      return fs.readlink(filePath)
    },

    async symlink(target: string, filePath: string, type?: string): Promise<void> {
      if (mode.dryRun) {
        mode.dryRunTracker?.record(createDryRunOperation('symlink', filePath, target))
        logger.info(`[DryRun] Would create symlink: ${filePath} -> ${target} (type: ${type})`)
        return
      }
      await fs.symlink(target, filePath, type as fs.SymlinkType)
    },

    async ensureSymlink(src: string, dest: string): Promise<void> {
      if (mode.dryRun) {
        mode.dryRunTracker?.record(createDryRunOperation('ensureSymlink', dest, src))
        logger.info(`[DryRun] Would ensure symlink: ${dest} -> ${src}`)
        return
      }
      await fs.ensureSymlink(src, dest)
    },
  }
}

/**
 * Create glob utilities for plugins
 */
function createGlob(): PluginGlob {
  return {
    match: async (patterns: string | string[], options?: Record<string, unknown>) => {
      const result = await glob(patterns, options as object)
      return result as unknown as string[]
    },
  }
}

/**
 * Create path utilities for plugins (Requirements 6.1, 6.2, 6.3)
 */
function createPaths(root: string): PluginPaths {
  const pathBuilder = PathBuilder.fromPath(root)

  return {
    root,
    dist: pathBuilder.dist(),
    ref: pathBuilder.ref(),
    userHome: os.homedir(),
    resolve: (...segments: string[]): string => {
      return path.join(root, ...segments)
    },
  }
}

/**
 * Create output target resolution utilities (Requirements 6.1, 6.2, 6.3)
 */
function createTargets(workspaceGroups: Record<string, string> = {}): PluginTargets {
  const homeDir = os.homedir()

  return {
    workspaceGroup: (name: string): string => {
      // Check configured workspace groups first
      const configured = workspaceGroups[name]
      if (configured !== '' && configured !== void 0) {
        return configured
      }
      // Default to ~/project/{name}
      return path.join(homeDir, 'project', name)
    },
    workspace: (group: string, name: string): string => {
      // Resolve workspace within a group
      const groupPath = workspaceGroups[group] ?? path.join(homeDir, 'project', group)
      return path.join(groupPath, name)
    },
    globalConfig: (tool: string): string => {
      // Resolve global config directory for a tool (e.g., ~/.claude, ~/.kiro)
      return path.join(homeDir, `.${tool}`)
    },
  }
}

/**
 * Create runtime mode flags (Requirements 21.1, 21.2, 21.3, 24.4)
 * When dryRun is true, creates a tracker for recording simulated operations
 *
 * @param dryRun - Whether to enable dry-run mode
 * @param cleanOnly - Whether to enable clean-only mode
 * @returns PluginMode with optional dryRunTracker
 */
function createMode(dryRun: boolean = false, cleanOnly: boolean = false): PluginMode {
  const mode: PluginMode = {
    dryRun,
    cleanOnly,
  }

  // Create tracker when in dry-run mode (Requirement 21.2)
  if (dryRun) {
    mode.dryRunTracker = createDryRunTracker()
  }

  return mode
}

/**
 * Create system capabilities
 * Provides implementations for front matter, blank line cleaning,
 * content injection, code block transformation, and markdown processing
 */
function createSystemCapabilities(): SystemCapabilities {
  return {
    frontMatter: createFrontMatterCapability(),
    blankLineCleaner: createBlankLineCleanerCapability(),
    contentInjection: createContentInjectionCapability(),
    codeBlockTransform: createCodeBlockTransformCapability(),
    markdown: createMarkdownCapability(),
  }
}

export interface PluginContextOptions {
  root?: string
  config: PluginConfig
  systemConfig?: PluginSystemConfig
  dryRun?: boolean
  cleanOnly?: boolean
  workspaceGroups?: Record<string, string>
}

/**
 * Create a plugin context instance
 * When dryRun is true, creates a tracker and passes it to file system utilities
 *
 * @param options - Context options including dryRun flag
 * @returns PluginContext instance
 * @see Requirements 21.1, 21.2, 21.3
 */
/**
 * Default root path for aindex project
 */
const DEFAULT_ROOT = PathBuilder.forProject('aindex').root()

export function createPluginContext(options: PluginContextOptions): PluginContext {
  const {
    root = DEFAULT_ROOT,
    config,
    systemConfig,
    dryRun = false,
    cleanOnly = false,
    workspaceGroups = {},
  } = options
  const emittedFiles: EmittedFile[] = []
  const inputBundles: InputBundle[] = []
  const meta: Record<string, unknown> = {}

  // Create mode first to get the tracker (Requirement 21.2)
  const mode = createMode(dryRun, cleanOnly)

  const paths = createPaths(root)
  const targets = createTargets(workspaceGroups)

  // Create base context
  const baseContext: PluginContext = {
    fs: createFileSystem(mode),
    paths,
    glob: createGlob(),
    targets,
    path: {
      ...path,
      resolve: (...paths: string[]) => path.resolve(...paths),
    },
    log: createPluginLog(),
    config,
    mode,
    meta,
    capabilities: createSystemCapabilities(),
    registry: createPluginRegistry(),
    getInputBundles: (type: InputType): InputBundle[] => {
      return inputBundles.filter((bundle) => bundle.type === type)
    },
    getAllInputBundles: (): InputBundle[] => {
      return [...inputBundles]
    },
    emitFile: (artifact: EmittedFile): string => {
      emittedFiles.push(artifact)
      return artifact.fileName
    },
    getEmittedFiles: (): EmittedFile[] => {
      return [...emittedFiles]
    },
    resolveOutputPaths: (outputs: PluginOutput[]): ResolvedOutputPaths => {
      const result: ResolvedOutputPaths = {}

      for (const output of outputs) {
        // First resolve any variables in the path
        const resolvedPath = resolvePathVariables(output.path)

        if (output.targetType === 'workspace') {
          result.workspacePath = paths.resolve(resolvedPath)
        } else if (output.targetType === 'globalConfig') {
          result.globalConfigPath = path.join(paths.userHome, resolvedPath)
        }
      }

      return result
    },
  }

  // Add new services if available
  if (systemConfig) {
    const contextWithServices = baseContext as PluginContext & {
      systemConfig: PluginSystemConfig
      classificationService: ClassificationService
    }
    contextWithServices.systemConfig = systemConfig
    contextWithServices.classificationService = new ClassificationService(systemConfig)
    return contextWithServices
  }

  return baseContext
}

/**
 * Create a plugin context with custom dependencies (for testing)
 * When dryRun is true and no mode is provided, creates a tracker
 *
 * @param options - Context options
 * @param deps - Custom dependencies to inject
 * @param deps.fs - File system utilities
 * @param deps.paths - Path utilities
 * @param deps.targets - Target resolution utilities
 * @param deps.log - Plugin log interface
 * @param deps.logger - Log adapter
 * @param deps.mode - Runtime mode flags
 * @param deps.capabilities - System capabilities
 * @param deps.inputBundles - Input bundles
 * @param deps.registry - Plugin registry
 * @returns PluginContext instance with injected dependencies
 * @see Requirements 21.1, 21.2, 21.3
 */
export function createPluginContextWithDeps(
  options: PluginContextOptions,
  deps: {
    fs?: PluginFileSystem
    paths?: PluginPaths
    targets?: PluginTargets
    log?: PluginLog
    logger?: LogAdapter
    mode?: PluginMode
    capabilities?: SystemCapabilities
    inputBundles?: InputBundle[]
    registry?: PluginRegistry
  },
): PluginContext {
  const {
    root = DEFAULT_ROOT,
    config,
    dryRun = false,
    cleanOnly = false,
    workspaceGroups = {},
  } = options
  const emittedFiles: EmittedFile[] = []
  const inputBundles: InputBundle[] = deps.inputBundles ?? []
  const meta: Record<string, unknown> = {}

  // Create mode first to get the tracker (Requirement 21.2)
  const mode = deps.mode ?? createMode(dryRun, cleanOnly)
  const paths = deps.paths ?? createPaths(root)
  const targets = deps.targets ?? createTargets(workspaceGroups)

  return {
    fs: deps.fs ?? createFileSystem(mode),
    paths,
    // TODO: Allow injecting mock glob
    glob: createGlob(),
    targets,
    path: {
      ...path,
      resolve: (...paths: string[]) => path.resolve(...paths),
    },
    log: deps.log ?? createPluginLog(),
    config,
    mode,
    meta,
    capabilities: deps.capabilities ?? createSystemCapabilities(),
    registry: deps.registry ?? createPluginRegistry(),
    getInputBundles: (type: InputType): InputBundle[] => {
      return inputBundles.filter((bundle) => bundle.type === type)
    },
    getAllInputBundles: (): InputBundle[] => {
      return [...inputBundles]
    },
    emitFile: (artifact: EmittedFile): string => {
      emittedFiles.push(artifact)
      return artifact.fileName
    },
    getEmittedFiles: (): EmittedFile[] => {
      return [...emittedFiles]
    },
    resolveOutputPaths: (outputs: PluginOutput[]): ResolvedOutputPaths => {
      const result: ResolvedOutputPaths = {}

      for (const output of outputs) {
        if (output.targetType === 'workspace') {
          result.workspacePath = paths.resolve(output.path)
        } else if (output.targetType === 'globalConfig') {
          result.globalConfigPath = path.join(paths.userHome, output.path)
        }
      }

      return result
    },
  }
}
