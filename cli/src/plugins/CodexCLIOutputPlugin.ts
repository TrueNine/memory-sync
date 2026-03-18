import type {AbstractOutputPluginOptions} from './plugin-core'
import {AbstractOutputPlugin, PLUGIN_NAMES} from './plugin-core'

const PROJECT_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.codex'
const PROMPTS_SUBDIR = 'prompts'
const AGENTS_SUBDIR = 'agents'
const CODEX_SUBAGENT_FIELD_ORDER = ['name', 'description', 'developer_instructions'] as const
const CODEX_EXCLUDED_SUBAGENT_FIELDS = ['scope', 'seriName', 'argumentHint', 'color', 'namingCase'] as const

function transformCodexSubAgentFrontMatter(
  sourceFrontMatter?: Record<string, unknown>
): Record<string, unknown> {
  const frontMatter = {...sourceFrontMatter}

  if (Array.isArray(frontMatter['allowTools']) && frontMatter['allowTools'].length > 0) frontMatter['allowedTools'] = frontMatter['allowTools'].join(', ')

  delete frontMatter['allowTools']
  return frontMatter
}

const CODEX_OUTPUT_OPTIONS = {
  globalConfigDir: GLOBAL_CONFIG_DIR,
  outputFileName: PROJECT_MEMORY_FILE,
  commands: {
    subDir: PROMPTS_SUBDIR,
    scopeRemap: {
      project: 'global'
    },
    transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
  },
  subagents: {
    subDir: AGENTS_SUBDIR,
    sourceScopes: ['project'],
    scopeRemap: {
      global: 'project'
    },
    ext: '.toml',
    artifactFormat: 'toml',
    bodyFieldName: 'developer_instructions',
    fileNameSource: 'frontMatterName',
    excludedFrontMatterFields: CODEX_EXCLUDED_SUBAGENT_FIELDS,
    transformFrontMatter: (_subAgent, context) => transformCodexSubAgentFrontMatter(context.sourceFrontMatter),
    fieldOrder: CODEX_SUBAGENT_FIELD_ORDER
  },
  cleanup: {
    delete: {
      project: {
        dirs: ['.codex/agents']
      },
      global: {
        files: ['.codex/AGENTS.md'],
        dirs: ['.codex/prompts']
      }
    },
    protect: {
      global: {
        dirs: ['.codex/skills/.system']
      }
    }
  },
  dependsOn: [PLUGIN_NAMES.AgentsOutput],
  capabilities: {
    prompt: {
      scopes: ['global'],
      singleScope: false
    },
    commands: {
      scopes: ['global'],
      singleScope: true
    },
    subagents: {
      scopes: ['project'],
      singleScope: true
    }
  }
} satisfies AbstractOutputPluginOptions

export class CodexCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CodexCLIOutputPlugin', CODEX_OUTPUT_OPTIONS)
  }
}
