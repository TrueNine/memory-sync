import type {
  AbstractOutputPluginOptions,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputFileDeclaration,
  OutputWriteContext,
  SkillPrompt
} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {
  AbstractOutputPlugin,
  filterByProjectConfig,
  PLUGIN_NAMES,
  resolveSubAgentCanonicalName
} from './plugin-core'

const PROJECT_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.codex'
const PROMPTS_SUBDIR = 'prompts'
const AGENTS_SUBDIR = 'agents'
const SKILLS_SUBDIR = 'skills'
const PRESERVED_SYSTEM_SKILL_DIR = '.system'
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'
const CODEX_SUBAGENT_FIELD_ORDER = ['name', 'description', 'developer_instructions'] as const
const CODEX_EXCLUDED_SUBAGENT_FIELDS = ['scope', 'seriName', 'argumentHint', 'color', 'namingCase', 'model'] as const

type CodexOutputSource
  = | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillMcpConfig', readonly rawContent: string}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {
      readonly kind: 'skillResource'
      readonly content: string
      readonly encoding: 'text' | 'base64'
    }

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
        dirs: ['.codex/agents', '.codex/skills', '.agents/skills', '.skills']
      },
      global: {
        files: ['.codex/AGENTS.md'],
        dirs: ['.codex/prompts', '.agents/skills', '.skills'],
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
    },
    skills: {
      scopes: ['project', 'global'],
      singleScope: true
    },
    mcp: {
      scopes: ['project', 'global'],
      singleScope: true
    }
  }
} satisfies AbstractOutputPluginOptions

export class CodexCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CodexCLIOutputPlugin', CODEX_OUTPUT_OPTIONS)
  }

  /**
   * Project-scoped output still writes to the workspace project, but Codex also
   * resolves user-installed skills from `~/.codex/skills/`. Cleanup therefore
   * needs to prune that global skills directory as well, while preserving the
   * built-in `.system/` subtree.
   */
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

  override async declareOutputFiles(
    ctx: OutputWriteContext
  ): Promise<OutputFileDeclaration[]> {
    const declarations = await super.declareOutputFiles(ctx)
    const {skills} = ctx.collectedOutputContext

    if (skills == null || skills.length === 0) return declarations

    const selectedSkills = this.selectSingleScopeItems(
      skills,
      ['project', 'global'],
      skill => this.resolveSkillSourceScope(skill),
      this.getTopicScopeOverride(ctx, 'skills')
    )
    const selectedMcpSkills = this.selectSingleScopeItems(
      skills,
      ['project', 'global'],
      skill => this.resolveSkillSourceScope(skill),
      this.getTopicScopeOverride(ctx, 'mcp')
      ?? this.getTopicScopeOverride(ctx, 'skills')
    )

    const pushSkillDeclarations = (
      baseDir: string,
      scope: 'project' | 'global',
      filteredSkills: readonly SkillPrompt[]
    ): void => {
      for (const skill of filteredSkills) {
        const skillName = this.getSkillName(skill)
        const skillDir = path.join(baseDir, SKILLS_SUBDIR, skillName)

        declarations.push({
          path: path.join(skillDir, SKILL_FILE_NAME),
          scope,
          source: {kind: 'skillMain', skill} satisfies CodexOutputSource
        })

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            declarations.push({
              path: path.join(
                skillDir,
                childDoc.relativePath.replace(/\.mdx$/, '.md')
              ),
              scope,
              source: {
                kind: 'skillChildDoc',
                content: childDoc.content as string
              } satisfies CodexOutputSource
            })
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            declarations.push({
              path: path.join(skillDir, resource.relativePath),
              scope,
              source: {
                kind: 'skillResource',
                content: resource.content,
                encoding: resource.encoding
              } satisfies CodexOutputSource
            })
          }
        }
      }
    }

    const pushSkillMcpDeclarations = (
      baseDir: string,
      scope: 'project' | 'global',
      filteredMcpSkills: readonly SkillPrompt[]
    ): void => {
      for (const skill of filteredMcpSkills) {
        if (skill.mcpConfig == null) continue

        const skillDir = path.join(baseDir, SKILLS_SUBDIR, this.getSkillName(skill))
        declarations.push({
          path: path.join(skillDir, MCP_CONFIG_FILE),
          scope,
          source: {
            kind: 'skillMcpConfig',
            rawContent: skill.mcpConfig.rawContent
          } satisfies CodexOutputSource
        })
      }
    }

    if (
      selectedSkills.selectedScope === 'project'
      || selectedMcpSkills.selectedScope === 'project'
    ) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue

        if (selectedSkills.selectedScope === 'project') {
          const filteredSkills = filterByProjectConfig(
            selectedSkills.items,
            project.projectConfig,
            'skills'
          )
          pushSkillDeclarations(projectBase, 'project', filteredSkills)
        }

        if (selectedMcpSkills.selectedScope === 'project') {
          const filteredMcpSkills = filterByProjectConfig(
            selectedMcpSkills.items,
            project.projectConfig,
            'skills'
          )
          pushSkillMcpDeclarations(projectBase, 'project', filteredMcpSkills)
        }
      }
    }

    if (selectedSkills.selectedScope !== 'global'
      && selectedMcpSkills.selectedScope !== 'global') return declarations

    const globalDir = this.getGlobalConfigDir()
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    if (selectedSkills.selectedScope === 'global') {
      const filteredSkills = filterByProjectConfig(
        selectedSkills.items,
        promptSourceProjectConfig,
        'skills'
      )
      pushSkillDeclarations(globalDir, 'global', filteredSkills)
    }
    if (selectedMcpSkills.selectedScope !== 'global') return declarations

    const filteredMcpSkills = filterByProjectConfig(
      selectedMcpSkills.items,
      promptSourceProjectConfig,
      'skills'
    )
    pushSkillMcpDeclarations(globalDir, 'global', filteredMcpSkills)
    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as CodexOutputSource | {kind?: string}

    switch (source.kind) {
      case 'skillMain': {
        const {skill} = source as Extract<CodexOutputSource, {kind: 'skillMain'}>
        const frontMatterData = this.buildSkillFrontMatter(skill)
        return this.buildMarkdownContent(
          skill.content as string,
          frontMatterData,
          ctx
        )
      }
      case 'skillMcpConfig':
        return (source as Extract<CodexOutputSource, {kind: 'skillMcpConfig'}>).rawContent
      case 'skillChildDoc':
        return (source as Extract<CodexOutputSource, {kind: 'skillChildDoc'}>).content
      case 'skillResource': {
        const resource = source as Extract<CodexOutputSource, {kind: 'skillResource'}>
        return resource.encoding === 'base64'
          ? Buffer.from(resource.content, 'base64')
          : resource.content
      }
      default:
        return super.convertContent(declaration, ctx)
    }
  }
}
