import type {
  CommandPrompt,
  OutputFileDeclaration,
  OutputWriteContext,
  ProjectChildrenMemoryPrompt,
  RulePrompt,
  RuleScope,
  SkillPrompt
} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, applySubSeriesGlobPrefix, filterByProjectConfig} from './plugin-core'

const QODER_CONFIG_DIR = '.qoder'
const RULES_SUBDIR = 'rules'
const COMMANDS_SUBDIR = 'commands'
const SKILLS_SUBDIR = 'skills'
const GLOBAL_RULE_FILE = 'global.md'
const PROJECT_RULE_FILE = 'always.md'
const CHILD_RULE_FILE_PREFIX = 'glob-'
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'
const TRIGGER_ALWAYS = 'always_on'
const TRIGGER_GLOB = 'glob'
const RULE_GLOB_KEY = 'glob'
const RULE_FILE_PREFIX = 'rule-'

type QoderOutputSource
  = | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'ruleContent', readonly content: string}
    | {readonly kind: 'rulePrompt', readonly rule: RulePrompt}
    | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillMcpConfig', readonly rawContent: string}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'ignoreFile', readonly content: string}

function transformQoderCommandFrontMatter(
  _cmd: CommandPrompt,
  context: {
    readonly sourceFrontMatter?: Record<string, unknown>
  }
): Record<string, unknown> {
  const source = context.sourceFrontMatter

  const frontMatter: Record<string, unknown> = {
    description: 'Fast command',
    type: 'user_command'
  }

  if (source?.['description'] != null) frontMatter['description'] = source['description']
  if (source?.['argumentHint'] != null) frontMatter['argumentHint'] = source['argumentHint']
  if (source?.['allowTools'] != null && Array.isArray(source['allowTools']) && source['allowTools'].length > 0) frontMatter['allowTools'] = source['allowTools']

  return frontMatter
}

export class QoderIDEPluginOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('QoderIDEPluginOutputPlugin', {
      globalConfigDir: QODER_CONFIG_DIR,
      indexignore: '.qoderignore',
      commands: {
        subDir: COMMANDS_SUBDIR,
        transformFrontMatter: transformQoderCommandFrontMatter
      },
      skills: {
        subDir: SKILLS_SUBDIR
      },
      rules: {
        subDir: RULES_SUBDIR,
        sourceScopes: ['project', 'global']
      },
      cleanup: {
        delete: {
          project: {
            dirs: ['.qoder/rules']
          },
          global: {
            dirs: ['.qoder/commands', '.qoder/rules', '.qoder/skills']
          }
        }
      },
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
    const {workspace, globalMemory, commands, skills, rules, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const {projects} = workspace
    const globalDir = this.getGlobalConfigDir()
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const activeRuleScopes = new Set(rules != null ? this.selectRuleScopes(ctx, rules) : [])
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))

    if (commands != null && commands.length > 0) {
      const scopedCommands = this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, cmd => this.resolveCommandSourceScope(cmd), this.getTopicScopeOverride(ctx, 'commands'))
      const filteredCommands = filterByProjectConfig(scopedCommands.items, projectConfig, 'commands')
      for (const cmd of filteredCommands) {
        declarations.push({
          path: path.join(globalDir, COMMANDS_SUBDIR, this.transformCommandName(cmd, transformOptions)),
          scope: 'global',
          source: {kind: 'command', command: cmd} satisfies QoderOutputSource
        })
      }
    }

    if (rules != null && rules.length > 0 && activeRuleScopes.has('global')) {
      const globalRules = rules.filter(r => this.normalizeSourceScope(this.normalizeRuleScope(r)) === 'global')
      for (const rule of globalRules) {
        declarations.push({
          path: path.join(globalDir, RULES_SUBDIR, this.buildRuleFileName(rule)),
          scope: 'global',
          source: {kind: 'rulePrompt', rule} satisfies QoderOutputSource
        })
      }
    }

    if (skills != null && skills.length > 0) {
      const scopedSkills = this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
      const filteredSkills = filterByProjectConfig(scopedSkills.items, projectConfig, 'skills')
      const scopedMcpSkills = this.selectSingleScopeItems(
        skills,
        this.skillsConfig.sourceScopes,
        skill => this.resolveSkillSourceScope(skill),
        this.getTopicScopeOverride(ctx, 'mcp') ?? this.getTopicScopeOverride(ctx, 'skills')
      )
      const filteredMcpSkills = filterByProjectConfig(scopedMcpSkills.items, projectConfig, 'skills')
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        const skillDir = path.join(globalDir, SKILLS_SUBDIR, skillName)
        declarations.push({
          path: path.join(skillDir, SKILL_FILE_NAME),
          scope: 'global',
          source: {kind: 'skillMain', skill} satisfies QoderOutputSource
        })

        if (skill.mcpConfig != null && filteredMcpSkills.includes(skill)) {
          declarations.push({
            path: path.join(skillDir, MCP_CONFIG_FILE),
            scope: 'global',
            source: {
              kind: 'skillMcpConfig',
              rawContent: skill.mcpConfig.rawContent
            } satisfies QoderOutputSource
          })
        }

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            declarations.push({
              path: path.join(skillDir, childDoc.relativePath.replace(/\.mdx$/, '.md')),
              scope: 'global',
              source: {
                kind: 'skillChildDoc',
                content: childDoc.content as string
              } satisfies QoderOutputSource
            })
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            declarations.push({
              path: path.join(skillDir, resource.relativePath),
              scope: 'global',
              source: {
                kind: 'skillResource',
                content: resource.content,
                encoding: resource.encoding
              } satisfies QoderOutputSource
            })
          }
        }
      }
    }

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      const projectRulesDir = path.join(projectDir.basePath, projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR)

      if (globalMemory != null && activePromptScopes.has('global')) {
        declarations.push({
          path: path.join(projectRulesDir, GLOBAL_RULE_FILE),
          scope: 'project',
          source: {
            kind: 'ruleContent',
            content: this.buildAlwaysRuleContent(globalMemory.content as string)
          } satisfies QoderOutputSource
        })
      }

      if (project.rootMemoryPrompt != null && activePromptScopes.has('project')) {
        declarations.push({
          path: path.join(projectRulesDir, PROJECT_RULE_FILE),
          scope: 'project',
          source: {
            kind: 'ruleContent',
            content: this.buildAlwaysRuleContent(project.rootMemoryPrompt.content as string)
          } satisfies QoderOutputSource
        })
      }

      if (project.childMemoryPrompts != null && activePromptScopes.has('project')) {
        for (const child of project.childMemoryPrompts) {
          declarations.push({
            path: path.join(projectRulesDir, this.buildChildRuleFileName(child)),
            scope: 'project',
            source: {
              kind: 'ruleContent',
              content: this.buildGlobRuleContent(child)
            } satisfies QoderOutputSource
          })
        }
      }

      if (rules != null && rules.length > 0 && activeRuleScopes.has('project')) {
        const projectRules = applySubSeriesGlobPrefix(
          filterByProjectConfig(rules.filter(r => this.normalizeSourceScope(this.normalizeRuleScope(r)) === 'project'), project.projectConfig, 'rules'),
          project.projectConfig
        )
        for (const rule of projectRules) {
          declarations.push({
            path: path.join(projectRulesDir, this.buildRuleFileName(rule)),
            scope: 'project',
            source: {kind: 'rulePrompt', rule} satisfies QoderOutputSource
          })
        }
      }
    }

    const ignoreOutputPath = this.getIgnoreOutputPath()
    const ignoreFile = this.indexignore == null
      ? void 0
      : aiAgentIgnoreConfigFiles?.find(file => file.fileName === this.indexignore)
    if (ignoreOutputPath != null && ignoreFile != null) {
      for (const project of projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null || project.isPromptSourceProject === true) continue
        declarations.push({
          path: path.join(projectDir.basePath, projectDir.path, ignoreOutputPath),
          scope: 'project',
          source: {
            kind: 'ignoreFile',
            content: ignoreFile.content
          } satisfies QoderOutputSource
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    _ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as QoderOutputSource
    switch (source.kind) {
      case 'command': return this.buildCommandContent(source.command)
      case 'ruleContent': return source.content
      case 'rulePrompt': return this.buildRuleContent(source.rule)
      case 'skillMain': {
        const fmData = this.buildSkillFrontMatter(source.skill)
        return buildMarkdownWithFrontMatter(fmData, source.skill.content as string)
      }
      case 'skillMcpConfig': return source.rawContent
      case 'skillChildDoc':
      case 'ignoreFile': return source.content
      case 'skillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  private buildChildRuleFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '').replaceAll('/', '-')
    return `${CHILD_RULE_FILE_PREFIX}${normalized.length > 0 ? normalized : 'root'}.md`
  }

  private buildAlwaysRuleContent(content: string): string {
    return buildMarkdownWithFrontMatter({trigger: TRIGGER_ALWAYS, type: 'user_command'}, content)
  }

  private buildGlobRuleContent(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '')
    const pattern = normalized.length === 0 ? '**/*' : `${normalized}/**`
    return buildMarkdownWithFrontMatter({trigger: TRIGGER_GLOB, [RULE_GLOB_KEY]: pattern, type: 'user_command'}, child.content as string)
  }

  protected override buildSkillFrontMatter(skill: SkillPrompt): Record<string, unknown> {
    const fm = skill.yamlFrontMatter
    return {
      name: fm.name,
      description: fm.description,
      type: 'user_command',
      ...fm.displayName != null && {displayName: fm.displayName},
      ...fm.keywords != null && fm.keywords.length > 0 && {keywords: fm.keywords},
      ...fm.author != null && {author: fm.author},
      ...fm.version != null && {version: fm.version},
      ...fm.allowTools != null && fm.allowTools.length > 0 && {allowTools: fm.allowTools}
    }
  }

  protected override buildRuleFileName(rule: RulePrompt, prefix: string = RULE_FILE_PREFIX): string {
    return `${prefix}${rule.prefix}-${rule.ruleName}.md`
  }

  protected override buildRuleContent(rule: RulePrompt): string {
    const fmData: Record<string, unknown> = {
      trigger: TRIGGER_GLOB,
      [RULE_GLOB_KEY]: rule.globs.length > 0 ? rule.globs.join(', ') : '**/*',
      type: 'user_command'
    }
    return buildMarkdownWithFrontMatter(fmData, rule.content)
  }

  protected override normalizeRuleScope(rule: RulePrompt): RuleScope {
    return rule.scope ?? 'global'
  }
}
