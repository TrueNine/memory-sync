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
import {
  AbstractOutputPlugin,
  applySubSeriesGlobPrefix,
  filterByProjectConfig,
  OutputDeclarationScopeKind
} from './plugin-core'

const QODER_CONFIG_DIR = '.qoder'
const RULES_SUBDIR = 'rules'
const COMMANDS_SUBDIR = 'commands'
const SKILLS_SUBDIR = 'skills'
const GLOBAL_RULE_FILE = 'global.md'
const PROJECT_RULE_FILE = 'always.md'
const CHILD_RULE_FILE_PREFIX = 'glob-'
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
      treatWorkspaceRootProjectAsProject: true,
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
            dirs: ['.qoder/commands', '.qoder/rules', '.qoder/skills']
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
    const {globalMemory, commands, skills, rules, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const globalDir = this.getGlobalConfigDir()
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const activeRuleScopes = new Set(rules != null ? this.selectRuleScopes(ctx, rules) : [])
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))
    const promptProjects = this.getProjectPromptOutputProjects(ctx)
    const selectedCommands = commands != null
      ? this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, command => this.resolveCommandSourceScope(command), this.getTopicScopeOverride(ctx, 'commands'))
      : {items: [] as readonly CommandPrompt[]}
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

    const pushSkillDeclarations = (
      baseDir: string,
      scope: 'project' | 'global',
      filteredSkills: readonly SkillPrompt[]
    ): void => {
      this.appendSkillDeclarations(declarations, baseDir, scope, filteredSkills, {
        skillSubDir: SKILLS_SUBDIR,
        buildSkillReferenceSource: childDoc => ({
          kind: 'skillChildDoc',
          content: childDoc.content as string
        })
      })
    }

    const pushSkillMcpDeclarations = (
      baseDir: string,
      scope: 'project' | 'global',
      filteredMcpSkills: readonly SkillPrompt[]
    ): void => {
      this.appendSkillMcpDeclarations(
        declarations,
        baseDir,
        scope,
        filteredMcpSkills,
        {
          skillSubDir: SKILLS_SUBDIR,
          fileName: MCP_CONFIG_FILE
        }
      )
    }

    if (selectedCommands.selectedScope === OutputDeclarationScopeKind.Project) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue

        const filteredCommands = filterByProjectConfig(selectedCommands.items, project.projectConfig, 'commands')
        this.appendCommandDeclarations(
          declarations,
          projectBase,
          OutputDeclarationScopeKind.Project,
          filteredCommands,
          transformOptions
        )
      }
    }

    if (selectedCommands.selectedScope === OutputDeclarationScopeKind.Global) {
      const filteredCommands = filterByProjectConfig(selectedCommands.items, promptSourceProjectConfig, 'commands')
      this.appendCommandDeclarations(
        declarations,
        globalDir,
        OutputDeclarationScopeKind.Global,
        filteredCommands,
        transformOptions
      )
    }

    if (selectedSkills.selectedScope === 'project' || selectedMcpSkills.selectedScope === 'project') {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue

        if (selectedSkills.selectedScope === 'project') {
          const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
          pushSkillDeclarations(projectBase, 'project', filteredSkills)
        }

        if (selectedMcpSkills.selectedScope === 'project') {
          const filteredMcpSkills = filterByProjectConfig(selectedMcpSkills.items, project.projectConfig, 'skills')
          pushSkillMcpDeclarations(projectBase, 'project', filteredMcpSkills)
        }
      }
    }

    if (selectedSkills.selectedScope === 'global' || selectedMcpSkills.selectedScope === 'global') {
      if (selectedSkills.selectedScope === 'global') {
        const filteredSkills = filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
        pushSkillDeclarations(globalDir, 'global', filteredSkills)
      }

      if (selectedMcpSkills.selectedScope === 'global') {
        const filteredMcpSkills = filterByProjectConfig(selectedMcpSkills.items, promptSourceProjectConfig, 'skills')
        pushSkillMcpDeclarations(globalDir, 'global', filteredMcpSkills)
      }
    }

    if (globalMemory != null && activePromptScopes.has('global')) {
      for (const project of promptProjects) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue
        declarations.push({
          path: path.join(projectBase, RULES_SUBDIR, GLOBAL_RULE_FILE),
          scope: 'project',
          source: {
            kind: 'ruleContent',
            content: this.buildAlwaysRuleContent(globalMemory.content as string, ctx)
          } satisfies QoderOutputSource
        })
      }
    }

    if (activePromptScopes.has('project')) {
      for (const project of promptProjects) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue

        if (project.rootMemoryPrompt != null) {
          declarations.push({
            path: path.join(projectBase, RULES_SUBDIR, PROJECT_RULE_FILE),
            scope: 'project',
            source: {
              kind: 'ruleContent',
              content: this.buildAlwaysRuleContent(project.rootMemoryPrompt.content as string, ctx)
            } satisfies QoderOutputSource
          })
        }

        if (project.childMemoryPrompts != null) {
          for (const child of project.childMemoryPrompts) {
            declarations.push({
              path: path.join(projectBase, RULES_SUBDIR, this.buildChildRuleFileName(child)),
              scope: 'project',
              source: {
                kind: 'ruleContent',
                content: this.buildGlobRuleContent(child, ctx)
              } satisfies QoderOutputSource
            })
          }
        }
      }
    }

    if (rules != null && rules.length > 0 && activeRuleScopes.has('project')) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue

        const projectRules = applySubSeriesGlobPrefix(
          filterByProjectConfig(rules.filter(rule => this.normalizeSourceScope(this.normalizeRuleScope(rule)) === 'project'), project.projectConfig, 'rules'),
          project.projectConfig
        )
        for (const rule of projectRules) {
          declarations.push({
            path: path.join(projectBase, RULES_SUBDIR, this.buildRuleFileName(rule)),
            scope: 'project',
            source: {kind: 'rulePrompt', rule} satisfies QoderOutputSource
          })
        }
      }
    }

    if (rules != null && rules.length > 0 && activeRuleScopes.has('global')) {
      const globalRules = rules.filter(rule => this.normalizeSourceScope(this.normalizeRuleScope(rule)) === 'global')
      for (const rule of globalRules) {
        declarations.push({
          path: path.join(globalDir, RULES_SUBDIR, this.buildRuleFileName(rule)),
          scope: 'global',
          source: {kind: 'rulePrompt', rule} satisfies QoderOutputSource
        })
      }
    }

    const ignoreOutputPath = this.getIgnoreOutputPath()
    const ignoreFile = this.indexignore == null
      ? void 0
      : aiAgentIgnoreConfigFiles?.find(file => file.fileName === this.indexignore)
    if (ignoreOutputPath != null && ignoreFile != null) {
      for (const project of this.getConcreteProjects(ctx)) {
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
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as QoderOutputSource
    switch (source.kind) {
      case 'command': return this.buildCommandContent(source.command, ctx)
      case 'ruleContent': return source.content
      case 'rulePrompt': return this.buildRuleContent(source.rule, ctx)
      case 'skillMain': {
        const fmData = this.buildSkillFrontMatter(source.skill)
        return this.buildMarkdownContent(source.skill.content as string, fmData, ctx)
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

  private buildAlwaysRuleContent(content: string, ctx: OutputWriteContext): string {
    return this.buildMarkdownContent(content, {trigger: TRIGGER_ALWAYS, type: 'user_command'}, ctx)
  }

  private buildGlobRuleContent(child: ProjectChildrenMemoryPrompt, ctx: OutputWriteContext): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '')
    const pattern = normalized.length === 0 ? '**/*' : `${normalized}/**`
    return this.buildMarkdownContent(child.content as string, {trigger: TRIGGER_GLOB, [RULE_GLOB_KEY]: pattern, type: 'user_command'}, ctx)
  }

  protected override buildSkillFrontMatter(skill: SkillPrompt): Record<string, unknown> {
    const fm = skill.yamlFrontMatter
    return {
      name: this.getSkillName(skill),
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

  protected override buildRuleContent(rule: RulePrompt, ctx?: OutputWriteContext): string {
    const fmData: Record<string, unknown> = {
      trigger: TRIGGER_GLOB,
      [RULE_GLOB_KEY]: rule.globs.length > 0 ? rule.globs.join(', ') : '**/*',
      type: 'user_command'
    }
    return this.buildMarkdownContent(rule.content, fmData, ctx)
  }

  protected override normalizeRuleScope(rule: RulePrompt): RuleScope {
    return rule.scope ?? 'global'
  }
}
