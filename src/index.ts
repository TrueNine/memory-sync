#!/usr/bin/env node

/**
 * Single CLI entry point for the plugin-based toolchain
 */

import process from 'node:process'
import { PluginRunner } from './core/PluginRunner'

// Re-export for library usage
export { autoSyncCommand, autoSyncWithFilter } from './commands/auto'
export {
  type BootstrapOptions,
  type BootstrapResult,
  type CleanResult,
  CleanupCollector,
  ConfigLoader,
  createPluginContext,
  createPluginContextWithDeps,
  createPluginRegistry,
  type EmittedFile,
  type ExtendedRunResult,
  type FilenameTransformRule,
  FrontMatterType,
  type InputBundle,
  type InputPlugin,
  type InputPluginFactory,
  InputType,
  type OutputPlugin,
  type OutputPluginFactory,
  type Plugin,
  type PluginConfig,
  type PluginContext,
  PluginError,
  type PluginFactory,
  type PluginFileSystem,
  type PluginGlobalOptions,
  type PluginLog,
  type PluginMode,
  type PluginOutput,
  type PluginPaths,
  type PluginRegistry,
  PluginRunner,
  type PluginRunnerOptions,
  type PluginState,
  type PluginTargets,
  type RunResult,
  type SystemCapabilities,
  type TransformResult,
  validateOutputPlugin,
  validatePlugin,
  ValidationError,
} from './core'
export { createBlankLineCleanerPlugin, createFrontMatterPlugin } from './plugins'

void PluginRunner.main(process.argv.slice(2))
