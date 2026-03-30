import type {CommandPrompt, OutputFileDeclaration, OutputWriteContext, RulePrompt, SkillPrompt, SubAgentPrompt} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {AbstractOutputPlugin, applySubSeriesGlobPrefix, filterByProjectConfig, PLUGIN_NAMES} from './plugin-core'

const GLOBAL_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.config/opencode'
const OPENCODE_CONFIG_FILE = 'opencode.json'
const OPENCODE_RULES_PLUGIN_NAME = 'opencode-rules@latest'
const PROJECT_RULES_DIR = '.opencode'
const COMMANDS_SUBDIR = 'commands'
const AGENTS_SUBDIR = 'agents'
const SKILLS_SUBDIR = 'skills'
const RULES_SUBDIR = 'rules'

type OpencodeOutputSource
  = | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'projectRootMemory', readonly content: string}
    | {readonly kind: 'projectChildMemory', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'subAgent', readonly agent: SubAgentPrompt}
    | {readonly kind: 'skillMain', readonly skill: SkillPrompt, readonly normalizedSkillName: string}
    | {readonly kind: 'skillReference', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'mcpConfig', readonly mcpServers: Record<string, Record<string, unknown>>}
    | {readonly kind: 'rule', readonly rule: RulePrompt}

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

export class OpencodeCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('OpencodeCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      treatWorkspaceRootProjectAsProject: true,
      commands: {
        subDir: COMMANDS_SUBDIR,
        transformFrontMatter: transformOpencodeCommandFrontMatter
      },
      subagents: {
        subDir: AGENTS_SUBDIR
      },
      skills: {
        subDir: SKILLS_SUBDIR
      },
      rules: {
        subDir: RULES_SUBDIR,
        prefix: 'rule',
        sourceScopes: ['project', 'global']
      },
      cleanup: {
        delete: {
          project: {
            files: [GLOBAL_MEMORY_FILE, '.opencode/opencode.json'],
            dirs: ['.opencode/commands', '.opencode/agents', '.opencode/skills', '.opencode/rules']
          },
          global: {
            files: ['.config/opencode/AGENTS.md'],
            dirs: ['.config/opencode/commands', '.config/opencode/agents', '.config/opencode/skills', '.config/opencode/rules']
          },
          xdgConfig: {
            files: ['opencode/AGENTS.md'],
            dirs: ['opencode/commands', 'opencode/agents', 'opencode/skills', 'opencode/rules']
          }
        }
      },
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        rules: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        commands: {
          scopes: ['project', 'global'],
          singleScope: true
        },
        subagents: {
          scopes: ['project', 'global'],
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
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {globalMemory, commands, subAgents, skills, rules} = ctx.collectedOutputContext
    const globalDir = this.getGlobalConfigDir()
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))
    const promptProjects = this.getProjectPromptOutputProjects(ctx)
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const selectedCommands
      = commands != null
        ? this.selectSingleScopeItems(
            commands,
            this.commandsConfig.sourceScopes,
            command => this.resolveCommandSourceScope(command),
            this.getTopicScopeOverride(ctx, 'commands')
          )
        : {items: [] as readonly CommandPrompt[]}
    const selectedSubAgents
      = subAgents != null
        ? this.selectSingleScopeItems(
            subAgents,
            this.subAgentsConfig.sourceScopes,
            subAgent => this.resolveSubAgentSourceScope(subAgent),
            this.getTopicScopeOverride(ctx, 'subagents')
          )
        : {items: [] as readonly SubAgentPrompt[]}
    const selectedSkills
      = skills != null
        ? this.selectSingleScopeItems(
            skills,
            this.skillsConfig.sourceScopes,
            skill => this.resolveSkillSourceScope(skill),
            this.getTopicScopeOverride(ctx, 'skills')
          )
        : {items: [] as readonly SkillPrompt[]}
    const selectedMcpSkills
      = skills != null
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

    const pushSkillDeclarations = (basePath: string, scope: 'project' | 'global', filteredSkills: readonly SkillPrompt[]): void => {
      for (const skill of filteredSkills) {
        const normalizedSkillName = this.validateAndNormalizeSkillName(this.getSkillName(skill))
        const skillDir = path.join(basePath, SKILLS_SUBDIR, normalizedSkillName)

        declarations.push({
          path: path.join(skillDir, 'SKILL.md'),
          scope,
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
              scope,
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
              scope,
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

    const pushMcpDeclaration = (basePath: string, scope: 'project' | 'global', _filteredSkills: readonly SkillPrompt[]): void => {
      void _filteredSkills
      declarations.push({
        path: path.join(basePath, OPENCODE_CONFIG_FILE),
        scope,
        source: {
          kind: 'mcpConfig',
          mcpServers: {}
        } satisfies OpencodeOutputSource
      })
    }

    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    for (const project of promptProjects) {
      const projectRootDir = this.resolveProjectRootDir(ctx, project)
      if (projectRootDir == null) continue

      if (project.rootMemoryPrompt != null && activePromptScopes.has('project')) {
        declarations.push({
          path: path.join(projectRootDir, GLOBAL_MEMORY_FILE),
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
    }

    if (
      selectedCommands.selectedScope === 'project'
      || selectedSubAgents.selectedScope === 'project'
      || selectedSkills.selectedScope === 'project'
      || selectedMcpSkills.selectedScope === 'project'
    ) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        if (projectRootDir == null) continue
        const basePath = path.join(projectRootDir, PROJECT_RULES_DIR)

        const filteredCommands = filterByProjectConfig(selectedCommands.items, project.projectConfig, 'commands')
        if (selectedCommands.selectedScope === 'project') {
          for (const command of filteredCommands) {
            declarations.push({
              path: path.join(basePath, COMMANDS_SUBDIR, this.transformCommandName(command, transformOptions)),
              scope: 'project',
              source: {kind: 'command', command} satisfies OpencodeOutputSource
            })
          }
        }

        const filteredSubAgents = filterByProjectConfig(selectedSubAgents.items, project.projectConfig, 'subAgents')
        if (selectedSubAgents.selectedScope === 'project') {
          for (const agent of filteredSubAgents) {
            declarations.push({
              path: path.join(basePath, AGENTS_SUBDIR, this.transformSubAgentName(agent)),
              scope: 'project',
              source: {kind: 'subAgent', agent} satisfies OpencodeOutputSource
            })
          }
        }

        const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
        if (selectedSkills.selectedScope === 'project') pushSkillDeclarations(basePath, 'project', filteredSkills)

        if (selectedMcpSkills.selectedScope === 'project') {
          const filteredMcpSkills = filterByProjectConfig(selectedMcpSkills.items, project.projectConfig, 'skills')
          pushMcpDeclaration(basePath, 'project', filteredMcpSkills)
        }
      }
    }

    if (selectedCommands.selectedScope === 'global') {
      const filteredCommands = filterByProjectConfig(selectedCommands.items, promptSourceProjectConfig, 'commands')
      for (const command of filteredCommands) {
        declarations.push({
          path: path.join(globalDir, COMMANDS_SUBDIR, this.transformCommandName(command, transformOptions)),
          scope: 'global',
          source: {kind: 'command', command} satisfies OpencodeOutputSource
        })
      }
    }

    if (selectedSubAgents.selectedScope === 'global') {
      const filteredSubAgents = filterByProjectConfig(selectedSubAgents.items, promptSourceProjectConfig, 'subAgents')
      for (const agent of filteredSubAgents) {
        declarations.push({
          path: path.join(globalDir, AGENTS_SUBDIR, this.transformSubAgentName(agent)),
          scope: 'global',
          source: {kind: 'subAgent', agent} satisfies OpencodeOutputSource
        })
      }
    }

    if (selectedSkills.selectedScope === 'global') {
      const filteredSkills = filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
      pushSkillDeclarations(globalDir, 'global', filteredSkills)
    }

    if (selectedMcpSkills.selectedScope === 'global') {
      const filteredMcpSkills = filterByProjectConfig(selectedMcpSkills.items, promptSourceProjectConfig, 'skills')
      pushMcpDeclaration(globalDir, 'global', filteredMcpSkills)
    }

    // Keep opencode.json managed so the generated config can preserve user fields
    // while normalizing the MCP section to an empty object.

    if (rules == null || rules.length === 0) return declarations

    const activeRuleScopes = this.selectRuleScopes(ctx, rules)
    for (const ruleScope of activeRuleScopes) {
      if (ruleScope === 'global') {
        const globalRules = rules.filter(rule => this.normalizeSourceScope(this.normalizeRuleScope(rule)) === 'global')
        for (const rule of globalRules) {
          declarations.push({
            path: path.join(globalDir, RULES_SUBDIR, this.buildRuleFileName(rule)),
            scope: 'global',
            source: {kind: 'rule', rule} satisfies OpencodeOutputSource
          })
        }
      } else if (ruleScope === 'project') {
        for (const project of this.getProjectOutputProjects(ctx)) {
          const projectRootDir = this.resolveProjectRootDir(ctx, project)
          if (projectRootDir == null) continue
          const basePath = path.join(projectRootDir, PROJECT_RULES_DIR)

          const projectRules = applySubSeriesGlobPrefix(
            filterByProjectConfig(
              rules.filter(rule => this.normalizeSourceScope(this.normalizeRuleScope(rule)) === 'project'),
              project.projectConfig,
              'rules'
            ),
            project.projectConfig
          )
          for (const rule of projectRules) {
            declarations.push({
              path: path.join(basePath, RULES_SUBDIR, this.buildRuleFileName(rule)),
              scope: 'project',
              source: {kind: 'rule', rule} satisfies OpencodeOutputSource
            })
          }
        }
      }
    }
    return declarations
  }

  override async convertContent(declaration: OutputFileDeclaration, ctx: OutputWriteContext): Promise<string | Buffer> {
    const source = declaration.source as OpencodeOutputSource
    switch (source.kind) {
      case 'globalMemory':
      case 'projectRootMemory':
      case 'projectChildMemory':
      case 'skillReference':
        return source.content
      case 'command':
        return this.buildCommandContent(source.command, ctx)
      case 'subAgent': {
        const frontMatter = this.buildOpencodeAgentFrontMatter(source.agent)
        return this.buildMarkdownContent(source.agent.content, frontMatter, ctx)
      }
      case 'skillMain': {
        const frontMatter = this.buildOpencodeSkillFrontMatter(source.skill, source.normalizedSkillName)
        return this.buildMarkdownContent(source.skill.content as string, frontMatter, ctx)
      }
      case 'skillResource':
        return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      case 'mcpConfig':
        return JSON.stringify(
          {
            $schema: 'https://opencode.ai/config.json',
            plugin: [OPENCODE_RULES_PLUGIN_NAME],
            mcp: {}
          },
          null,
          2
        )
      case 'rule':
        return this.buildRuleContent(source.rule, ctx)
      default:
        throw new Error(`Unsupported declaration source for ${this.name}`)
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

    const reservedFields = new Set([
      'name',
      'description',
      'license',
      'compatibility',
      'namingCase',
      'allowTools',
      'keywords',
      'displayName',
      'author',
      'version'
    ])
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
