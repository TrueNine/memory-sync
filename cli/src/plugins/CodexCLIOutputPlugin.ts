import type {AbstractOutputPluginOptions, OutputCleanContext, OutputCleanupDeclarations} from './plugin-core'
import {AbstractOutputPlugin, PLUGIN_NAMES, resolveSubAgentCanonicalName} from './plugin-core'

const PROJECT_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.codex'
const PROMPTS_SUBDIR = 'prompts'
const AGENTS_SUBDIR = 'agents'
const SKILLS_SUBDIR = 'skills'
const PRESERVED_SYSTEM_SKILL_DIR = '.system'
const CODEX_SUBAGENT_FIELD_ORDER = ['name', 'description', 'developer_instructions'] as const
const CODEX_EXCLUDED_SUBAGENT_FIELDS = ['scope', 'seriName', 'argumentHint', 'color', 'namingCase', 'model'] as const

function sanitizeCodexFrontMatter(
  sourceFrontMatter?: Record<string, unknown>
): Record<string, unknown> {
  const frontMatter = {...sourceFrontMatter}

  // Codex front matter rejects tool allowlists. Keep accepting upstream metadata
  // for other outputs, but drop both common spellings here for Codex compatibility.
  delete frontMatter['allowTools']
  delete frontMatter['allowedTools']
  return frontMatter
}

function transformCodexSubAgentFrontMatter(
  subAgentCanonicalName: string,
  sourceFrontMatter?: Record<string, unknown>
): Record<string, unknown> {
  const frontMatter = sanitizeCodexFrontMatter(sourceFrontMatter)
  frontMatter['name'] = subAgentCanonicalName
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
    transformFrontMatter: (_cmd, context) => sanitizeCodexFrontMatter(context.sourceFrontMatter)
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
    excludedFrontMatterFields: CODEX_EXCLUDED_SUBAGENT_FIELDS,
    transformFrontMatter: (subAgent, context) => transformCodexSubAgentFrontMatter(resolveSubAgentCanonicalName(subAgent), context.sourceFrontMatter),
    fieldOrder: CODEX_SUBAGENT_FIELD_ORDER
  },
  cleanup: {
    delete: {
      project: {
        dirs: ['.codex/agents']
      },
      global: {
        files: ['.codex/AGENTS.md'],
        dirs: ['.codex/prompts'],
        globs: ['.codex/skills/*']
      }
    },
    protect: {
      global: {
        dirs: [`.codex/${SKILLS_SUBDIR}/${PRESERVED_SYSTEM_SKILL_DIR}`]
      }
    }
  },
  wslMirrors: [
    '~/.codex/config.toml',
    '~/.codex/auth.json'
  ],
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

  override async declareCleanupPaths(ctx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
    const declarations = await super.declareCleanupPaths(ctx)

    return {
      ...declarations,
      delete: (declarations.delete ?? []).map(target => {
        if (target.kind !== 'glob') return target

        const normalizedPath = target.path.replaceAll('\\', '/')
        if (!normalizedPath.endsWith(`/.codex/${SKILLS_SUBDIR}/*`)) return target

        return {
          ...target,
          excludeBasenames: [PRESERVED_SYSTEM_SKILL_DIR]
        }
      })
    }
  }
}
