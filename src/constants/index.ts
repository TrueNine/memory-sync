import type { PromptDirectoryExport, PromptTarget, SupportArtifact, TrueNineConfig } from '../types'

export * from './paths'
export * from './templates'

export const DEFAULT_CONFIG: TrueNineConfig = {
  projectName: 'aindex',
  author: '',
  description: 'Personal digital knowledge base and prompt engineering workspace',
  version: '1.0.0',
  promptSettings: {
    autoBuild: false,
    buildOnSave: false,
    outputFormat: 'markdown',
  },
  projectSettings: {
    autoSync: false,
    validateStructure: true,
  },
}

export const DIRECTORY_STRUCTURE = [
  '_ai/src',
  '_ai/commands',
  '_ai/agents',
  '_ai/meta',
  '_ai/sources',
  '_ai/src_ai',
  'dist',
  'ref',
  'ai',
  'pl',
  'concepts',
  'platforms',
  'softwares',
  'projects',
  'games',
  'companies',
  'character',
  'companions',
  'diaries',
  'templates',
  'temp',
  'qas',
] as const

export const CONFIG_FILE_NAME = '.truenine.json'

export const PROMPT_TARGETS: readonly PromptTarget[] = [
  { label: 'Claude Global Prompt', segments: ['.claude', 'CLAUDE.md'] },
  { label: 'Codex Agents', segments: ['.codex', 'AGENTS.md'] },
  { label: 'Factory Agents', segments: ['.factory', 'AGENTS.md'] },
  { label: 'Windsurf Global Rules', segments: ['.codeium', 'windsurf', 'memories', 'global_rules.md'] },
  { label: 'Gemini Global Prompt', segments: ['.gemini', 'GEMINI.md'] },
] as const

export const SUPPORT_ARTIFACTS: readonly SupportArtifact[] = [
  {
    label: 'Claude Configuration',
    type: 'directory',
    sourceSegments: ['.claude'],
    targetSegments: ['.claude'],
    ignore: ['settings.locale.json', 'settings.local.json'],
  },
  {
    label: 'Factory Configuration',
    type: 'directory',
    sourceSegments: ['.factory'],
    targetSegments: ['.factory'],
  },
  {
    label: 'IDE Code Styles',
    type: 'directory',
    sourceSegments: ['.idea', 'codeStyles'],
    targetSegments: ['.idea', 'codeStyles'],
  },
  {
    label: 'IDE Gitignore',
    type: 'file',
    sourceSegments: ['.idea', '.gitignore'],
    targetSegments: ['.idea', '.gitignore'],
  },
  {
    label: 'VSCode Settings',
    type: 'file',
    sourceSegments: ['.vscode', 'settings.json'],
    targetSegments: ['.vscode', 'settings.json'],
  },
] as const

export const PROMPT_DIRECTORIES: readonly PromptDirectoryExport[] = [
  {
    label: 'Command Prompts',
    sourceSegments: ['dist', 'commands'],
    targetSegments: ['.codex', 'prompts'],
  },
] as const
