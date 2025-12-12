/**
 * Default plugin system configuration
 * Provides sensible defaults that can be overridden by users
 */

/* eslint-disable no-inline-comments */
import type {
  InputClassificationRule,
  PathTransformConfig,
  PluginSystemConfig,
} from '../types'
import { FrontMatterType, InputType } from '../types'

/**
 * Default input classification rules
 * Mirrors the current hardcoded logic in AindexInputPlugin and RefInputPlugin
 */
export const defaultInputClassificationRules: InputClassificationRule[] = [
  {
    type: InputType.MEMORY_PROMPT,
    patterns: ['AGENTS.md', 'MEMORY.md'],
    priority: 100,
  },
  {
    type: InputType.GLOBAL_PROMPT,
    patterns: ['GLOBAL.md', 'CLAUDE.md'],
    priority: 100,
  },
  {
    type: InputType.SUB_AGENT,
    patterns: ['agents/**/*', '**/agents/**/*'],
    priority: 90,
  },
  {
    type: InputType.FAST_COMMAND,
    patterns: ['commands/**/*', '**/commands/**/*'],
    priority: 90,
  },
  {
    type: InputType.SKILL,
    patterns: ['skills/**/*', '**/skills/**/*'],
    priority: 90,
  },
  {
    type: InputType.CONFIG_FILE,
    patterns: ['!**/*.md'],
    priority: 80,
  },
  {
    type: InputType.MEMORY_PROMPT,
    patterns: ['**/*.md'], /* Default for all other markdown files */
    priority: 10,
  },
]

/**
 * Default path configurations for each plugin
 * Extracted from existing plugin implementations
 */
export const defaultPathConfigs: Record<string, PathTransformConfig> = {
  // CLI Tools
  claudeCode: {
    outputDir: '.claude/',
    createDir: true,
  },
  gemini: {
    outputDir: '.gemini/',
    createDir: true,
  },
  codex: {
    outputDir: '.codex/',
    createDir: true,
  },
  factoryDroid: {
    outputDir: '.factory-droid/',
    createDir: true,
  },

  // IDE Tools
  cursor: {
    outputDir: '.cursor/rules/',
    createDir: true,
    filenameTransform: (name: string) => name.replace(/\.md$/, '.mdc'),
  },
  kiro: {
    outputDir: '.kiro/steering/',
    createDir: true,
  },
  qoder: {
    outputDir: '.qoder/rules/',
    createDir: true,
  },
  windsurf: {
    outputDir: '.windsurf/workflows/',
    createDir: true,
  },
  antigravity: {
    outputDir: '.agent/',
    createDir: true,
  },
  codebuddy: {
    outputDir: '.codebuddy/.rules/',
    createDir: true,
  },

  // Config Files
  vscode: {
    outputDir: '.vscode/',
    createDir: true,
  },
  jetbrains: {
    outputDir: '.idea/',
    createDir: true,
  },
  editorconfig: {
    outputDir: './', /* Root directory */
    filenameTransform: () => '.editorconfig',
  },
}

/**
 * Default front matter mappings
 * Maps string identifiers to FrontMatterType enum values
 */
export const defaultFrontMatterMapping: Record<string, FrontMatterType> = {
  // Kiro
  'kiro-always': FrontMatterType.KIRO_ALWAYS,
  'kiro-file-match': FrontMatterType.KIRO_FILE_MATCH,

  // Qoder
  'qoder-always': FrontMatterType.QODER_ALWAYS,
  'qoder-glob': FrontMatterType.QODER_GLOB,

  // Antigravity
  'antigravity-always': FrontMatterType.ANTIGRAVITY_ALWAYS,
  'antigravity-glob': FrontMatterType.ANTIGRAVITY_GLOB,

  // Windsurf (Workflow)
  'workflow-auto': FrontMatterType.WORKFLOW_AUTO,
}

/**
 * Default global path configurations
 */
export const defaultGlobalPaths = {
  workspaceOutput: '.',
  globalOutput: '~',
  tempDir: '.tmp',
}

/**
 * Default plugin system configuration
 * Combines all default configurations into a single object
 */
export const defaultPluginConfig: PluginSystemConfig = {
  inputClassification: {
    rules: defaultInputClassificationRules,
    defaultType: InputType.CONFIG_FILE,
  },
  paths: defaultPathConfigs,
  frontMatterMapping: defaultFrontMatterMapping,
  globalPaths: defaultGlobalPaths,
}
