import type {CommandPrompt, OutputFileDeclaration, OutputWriteContext, SkillPrompt, SubAgentPrompt} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {
  AbstractOutputPlugin,
  filterByProjectConfig,
  McpConfigManager,
  PLUGIN_NAMES,
  transformMcpConfigForOpencode
} from './plugin-core'

const GLOBAL_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.config/opencode'
const OPENCODE_CONFIG_FILE = 'opencode.json'
const OPENCODE_RULES_PLUGIN_NAME = 'opencode-rules@latest'
const PROJECT_RULES_DIR = '.opencode'
const COMMANDS_SUBDIR = 'commands'
const AGENTS_SUBDIR = 'agents'

type OpencodeOutputSource
  = | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'projectRootMemory', readonly content: string}
    | {readonly kind: 'projectChildMemory', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'subAgent', readonly agent: SubAgentPrompt}
    | {readonly kind: 'skillMain', readonly skill: SkillPrompt, readonly normalizedSkillName: string}
    | {readonly kind: 'skillReference', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'globalMcpConfig', readonly mcpServers: Record<string, Record<string, unknown>>}

function transformOpencodeCommandFrontMatter(
  _cmd: CommandPrompt,
  context: {
    readonly sourceFrontMatter?: Record<string, unknown>
  }
): Record<string, unknown> {
  const frontMatter: Record<string, unknown> = {}
  const source = context.sourceFrontMatter

  if (source?.['description'] != null) frontMatter['description'] = source['description']
  if (source?.['agent'] != null) frontMatter['agent'] = source['agent']
  if (source?.['model'] != null) frontMatter['model'] = source['model']

  if (source?.['allowTools'] != null && Array.isArray(source['allowTools'])) {
    const tools: Record<string, boolean> = {}
    for (const tool of source['allowTools']) tools[String(tool)] = true
    frontMatter['tools'] = tools
  }

  for (const [key, value] of Object.entries(source ?? {})) {
    if (!['description', 'agent', 'model', 'allowTools', 'namingCase', 'argumentHint'].includes(key)) frontMatter[key] = value
  }

  return frontMatter
}

/**
 * Opencode CLI output plugin.
 * Outputs global memory, commands, agents, and skills to ~/.config/opencode/
 */
export class OpencodeCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('OpencodeCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      commands: {
        subDir: COMMANDS_SUBDIR,
        transformFrontMatter: transformOpencodeCommandFrontMatter
      },
      subagents: {
        subDir: AGENTS_SUBDIR
      },
      skills: {
        subDir: 'skills'
      },
      cleanup: {
        delete: {
          project: {
            files: [GLOBAL_MEMORY_FILE],
            dirs: ['.opencode/commands', '.opencode/agents', '.opencode/skills']
          },
          global: {
            files: ['.config/opencode/AGENTS.md', '.config/opencode/opencode.json'],
            dirs: ['.config/opencode/commands', '.config/opencode/agents', '.config/opencode/skills']
          },
          xdgConfig: {
            files: ['opencode/AGENTS.md', 'opencode/opencode.json'],
            dirs: ['opencode/commands', 'opencode/agents', 'opencode/skills']
          }
        }
      },
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        commands: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        },
        subagents: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        },
        skills: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        },
        mcp: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {workspace, globalMemory, commands, subAgents, skills} = ctx.collectedOutputContext
    const globalDir = this.getGlobalConfigDir()
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))
    const selectedCommands = commands != null
      ? this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, cmd => this.resolveCommandSourceScope(cmd), this.getTopicScopeOverride(ctx, 'commands'))
      : {items: [] as readonly CommandPrompt[]}
    const selectedSubAgents = subAgents != null
      ? this.selectSingleScopeItems(subAgents, this.subAgentsConfig.sourceScopes, subAgent => this.resolveSubAgentSourceScope(subAgent), this.getTopicScopeOverride(ctx, 'subagents'))
      : {items: [] as readonly SubAgentPrompt[]}
    const selectedSkills = skills != null
      ? this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
      : {items: [] as readonly SkillPrompt[]}
    const selectedMcpSkills = skills != null
      ? this.selectSingleScopeItems(
          skills,
          this.skillsConfig.sourceScopes,
          skill => this.resolveSkillSourceScope(skill),
          this.getTopicScopeOverride(ctx, 'mcp') ?? this.getTopicScopeOverride(ctx, 'skills')
        )
      : {items: [] as readonly SkillPrompt[]}

    if (globalMemory != null && activePromptScopes.has('global')) {
      declarations.push({
        path: path.join(globalDir, GLOBAL_MEMORY_FILE),
        scope: 'global',
        source: {
          kind: 'globalMemory',
          content: globalMemory.content as string
        } satisfies OpencodeOutputSource
      })
    }

    if (selectedMcpSkills.items.length > 0) {
      const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
      const filteredSkills = filterByProjectConfig(selectedMcpSkills.items, projectConfig, 'skills')
      const manager = new McpConfigManager({fs: ctx.fs, logger: this.log})
      const servers = manager.collectMcpServers(filteredSkills)
      if (servers.size > 0) {
        declarations.push({
          path: path.join(globalDir, OPENCODE_CONFIG_FILE),
          scope: 'global',
          source: {
            kind: 'globalMcpConfig',
            mcpServers: manager.transformMcpServers(servers, transformMcpConfigForOpencode)
          } satisfies OpencodeOutputSource
        })
      }
    }

    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      const basePath = path.join(projectDir.basePath, projectDir.path, PROJECT_RULES_DIR)

      if (project.rootMemoryPrompt != null && activePromptScopes.has('project')) {
        declarations.push({
          path: this.resolveFullPath(projectDir),
          scope: 'project',
          source: {
            kind: 'projectRootMemory',
            content: project.rootMemoryPrompt.content as string
          } satisfies OpencodeOutputSource
        })
      }

      if (project.childMemoryPrompts != null && activePromptScopes.has('project')) {
        for (const child of project.childMemoryPrompts) {
          declarations.push({
            path: this.resolveFullPath(child.dir),
            scope: 'project',
            source: {
              kind: 'projectChildMemory',
              content: child.content as string
            } satisfies OpencodeOutputSource
          })
        }
      }

      if (this.commandOutputEnabled && selectedCommands.items.length > 0) {
        const filteredCommands = filterByProjectConfig(selectedCommands.items, project.projectConfig, 'commands')
        for (const cmd of filteredCommands) {
          declarations.push({
            path: path.join(basePath, this.commandsConfig.subDir, this.transformCommandName(cmd, transformOptions)),
            scope: 'project',
            source: {kind: 'command', command: cmd} satisfies OpencodeOutputSource
          })
        }
      }

      if (this.subAgentOutputEnabled && selectedSubAgents.items.length > 0) {
        const filteredSubAgents = filterByProjectConfig(selectedSubAgents.items, project.projectConfig, 'subAgents')
        const {subDir} = this.subAgentsConfig
        for (const agent of filteredSubAgents) {
          declarations.push({
            path: path.join(basePath, subDir, this.transformSubAgentName(agent)),
            scope: 'project',
            source: {kind: 'subAgent', agent} satisfies OpencodeOutputSource
          })
        }
      }

      if (this.skillOutputEnabled && selectedSkills.items.length > 0) {
        const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
        for (const skill of filteredSkills) {
          const normalizedSkillName = this.validateAndNormalizeSkillName((skill.yamlFrontMatter?.name as string | undefined) ?? skill.dir.getDirectoryName())
          const skillDir = path.join(basePath, this.skillsConfig.subDir, normalizedSkillName)

          declarations.push({
            path: path.join(skillDir, 'SKILL.md'),
            scope: 'project',
            source: {
              kind: 'skillMain',
              skill,
              normalizedSkillName
            } satisfies OpencodeOutputSource
          })

          if (skill.childDocs != null) {
            for (const refDoc of skill.childDocs) {
              declarations.push({
                path: path.join(skillDir, refDoc.dir.path.replace(/\.mdx$/, '.md')),
                scope: 'project',
                source: {
                  kind: 'skillReference',
                  content: refDoc.content as string
                } satisfies OpencodeOutputSource
              })
            }
          }

          if (skill.resources != null) {
            for (const resource of skill.resources) {
              declarations.push({
                path: path.join(skillDir, resource.relativePath),
                scope: 'project',
                source: {
                  kind: 'skillResource',
                  content: resource.content,
                  encoding: resource.encoding
                } satisfies OpencodeOutputSource
              })
            }
          }
        }
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as OpencodeOutputSource
    switch (source.kind) {
      case 'globalMemory':
      case 'projectRootMemory':
      case 'projectChildMemory':
      case 'skillReference': return source.content
      case 'command': return this.buildCommandContent(source.command, ctx)
      case 'subAgent': {
        const frontMatter = this.buildOpencodeAgentFrontMatter(source.agent)
        return this.buildMarkdownContent(source.agent.content, frontMatter, ctx)
      }
      case 'skillMain': {
        const frontMatter = this.buildOpencodeSkillFrontMatter(source.skill, source.normalizedSkillName)
        return this.buildMarkdownContent(source.skill.content as string, frontMatter, ctx)
      }
      case 'skillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      case 'globalMcpConfig':
        return JSON.stringify({
          $schema: 'https://opencode.ai/config.json',
          plugin: [OPENCODE_RULES_PLUGIN_NAME],
          mcp: source.mcpServers
        }, null, 2)
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  private buildOpencodeAgentFrontMatter(agent: SubAgentPrompt): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = agent.yamlFrontMatter as Record<string, unknown> | undefined

    if (source?.['description'] != null) frontMatter['description'] = source['description']

    frontMatter['mode'] = source?.['mode'] ?? 'subagent'

    if (source?.['model'] != null) frontMatter['model'] = source['model']
    if (source?.['temperature'] != null) frontMatter['temperature'] = source['temperature']
    if (source?.['maxSteps'] != null) frontMatter['maxSteps'] = source['maxSteps']
    if (source?.['hidden'] != null) frontMatter['hidden'] = source['hidden']

    if (source?.['allowTools'] != null && Array.isArray(source['allowTools'])) {
      const tools: Record<string, boolean> = {}
      for (const tool of source['allowTools']) tools[String(tool)] = true
      frontMatter['tools'] = tools
    }

    if (source?.['permission'] != null && typeof source['permission'] === 'object') frontMatter['permission'] = source['permission']

    for (const [key, value] of Object.entries(source ?? {})) {
      if (!['description', 'mode', 'model', 'temperature', 'maxSteps', 'hidden', 'allowTools', 'permission', 'namingCase', 'name', 'color'].includes(key)) {
        frontMatter[key] = value
      }
    }

    return frontMatter
  }

  private buildOpencodeSkillFrontMatter(skill: SkillPrompt, skillName: string): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = skill.yamlFrontMatter as Record<string, unknown> | undefined

    frontMatter['name'] = skillName
    if (source?.['description'] != null) frontMatter['description'] = source['description']

    frontMatter['license'] = source?.['license'] ?? 'MIT'
    frontMatter['compatibility'] = source?.['compatibility'] ?? 'opencode'

    const metadata: Record<string, unknown> = {}
    const metadataFields = ['author', 'version', 'keywords', 'category', 'repository', 'displayName']

    for (const field of metadataFields) {
      if (source?.[field] != null) metadata[field] = source[field]
    }

    const reservedFields = new Set(['name', 'description', 'license', 'compatibility', 'namingCase', 'allowTools', 'keywords', 'displayName', 'author', 'version'])
    for (const [key, value] of Object.entries(source ?? {})) {
      if (!reservedFields.has(key)) metadata[key] = value
    }

    if (Object.keys(metadata).length > 0) frontMatter['metadata'] = metadata

    return frontMatter
  }

  private validateAndNormalizeSkillName(name: string): string {
    let normalized = name.toLowerCase()
    normalized = normalized.replaceAll(/[^a-z0-9-]+/g, '-')
    normalized = normalized.replaceAll(/-+/g, '-')
    normalized = normalized.replaceAll(/^-|-$/g, '')

    if (normalized.length === 0) normalized = 'skill'
    else if (normalized.length > 64) {
      normalized = normalized.slice(0, 64)
      normalized = normalized.replace(/-$/, '')
    }

    return normalized
  }
}
