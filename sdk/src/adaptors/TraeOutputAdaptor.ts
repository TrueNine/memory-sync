import type {CommandPrompt, OutputDeclarationScope, OutputFileDeclaration, OutputWriteContext, RulePrompt, SkillPrompt} from './adaptor-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {AbstractOutputAdaptor, applySubSeriesGlobPrefix, filterByProjectConfig} from './adaptor-core'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'

const TRAE_GLOBAL_CONFIG_DIR = '.trae'
const TRAE_CN_GLOBAL_CONFIG_DIR = '.trae-cn'

const STEERING_SUBDIR = 'steering'
const SKILLS_SUBDIR = 'skills'
const USER_RULES_SUBDIR = 'user_rules'

type TraeOutputSource
  = | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'globalMemoryCn', readonly content: string}
    | {readonly kind: 'rule', readonly rule: RulePrompt}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'ignoreFile', readonly content: string}

export interface TraeConfigValidationResult {
  readonly valid: boolean
  readonly error?: string
  readonly warning?: string
}

export function validateTraeCnConfig(
  pluginsConfig: Record<string, boolean | undefined> | undefined,
  logger?: {warn: (input: {code: string, title: string, rootCause: [string, ...string[]]}) => void}
): TraeConfigValidationResult {
  if (pluginsConfig == null) {
    return {valid: true}
  }

  const traeCnValue = pluginsConfig['traeCn']
  const traeValue = pluginsConfig['trae']

  if (traeCnValue !== void 0 && typeof traeCnValue !== 'boolean') {
    return {
      valid: false,
      error: `[TraeOutputAdaptor] traeCn 配置项必须为 boolean 类型，当前类型: ${typeof traeCnValue}`
    }
  }

  if (traeValue !== void 0 && typeof traeValue !== 'boolean') {
    return {
      valid: false,
      error: `[TraeOutputAdaptor] trae 配置项必须为 boolean 类型，当前类型: ${typeof traeValue}`
    }
  }

  // eslint-disable-next-line @truenine/prefer-guard-clause
  if (traeCnValue === true && traeValue === true) {
    const warning = '[TraeOutputAdaptor] 警告: 同时启用 trae 和 traeCn 可能导致重复输出，建议只启用其中一个'
    if (logger) {
      logger.warn({code: 'TRAECN_DUPLICATE_WARNING', title: warning, rootCause: [warning]})
    }
    return {valid: true, warning}
  }

  return {valid: true}
}

/**
 * Trae 输出适配器。
 *
 * @remarks
 * - 截至 2026-04-15，Trae 至少还不支持 commands。
 * - 截至 2026-04-15，Trae 至少还不支持 subagents。
 */
export class TraeOutputAdaptor extends AbstractOutputAdaptor {
  private readonly enableTraeCn: boolean

  constructor(options?: {enableTraeCn?: boolean}) {
    super('TraeOutputAdaptor', {
      globalConfigDir: TRAE_GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      treatWorkspaceRootProjectAsProject: true,
      indexignore: '.traeignore',
      dependsOn: [],
      skills: {
        subDir: SKILLS_SUBDIR
      },
      rules: {
        prefix: 'rule',
        transformFrontMatter: (rule: RulePrompt) => ({
          globs: rule.globs.join(', ')
        })
      },
      cleanup: {
        delete: {
          project: {
            dirs: ['.trae/commands', '.trae/skills', '.trae/rules']
          },
          global: {
            dirs: ['.trae/steering', '.trae/commands', '.trae/skills', '.trae/rules', '.trae-cn/user_rules']
          }
        }
      },
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        skills: {
          scopes: ['project', 'global'],
          singleScope: true
        },
        rules: {
          scopes: ['project', 'global'],
          singleScope: false
        }
      }
    })
    this.enableTraeCn = options?.enableTraeCn ?? true
  }

  private getGlobalSteeringDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), STEERING_SUBDIR)
  }

  private getGlobalUserRulesDir(): string {
    return this.joinPath(this.getHomeDir(), TRAE_CN_GLOBAL_CONFIG_DIR, USER_RULES_SUBDIR)
  }

  protected override getIgnoreOutputPath(): string | undefined {
    if (this.indexignore == null) return void 0
    return path.join('.trae', '.ignore')
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const validation = validateTraeCnConfig(ctx.pluginOptions?.plugins as Record<string, boolean | undefined> | undefined, {
      warn: (input: {code: string, title: string, rootCause: [string, ...string[]]}) => this.log.warn(input)
    })

    if (!validation.valid) {
      this.log.error({code: 'TRAECN_CONFIG_ERROR', title: validation.error ?? 'TraeCn configuration validation failed', rootCause: [validation.error ?? '']})
    }

    const declarations: OutputFileDeclaration[] = []
    const {skills, rules, globalMemory, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const concreteProjects = this.getConcreteProjects(ctx)
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))
    const selectedSkills
      = skills != null
        ? this.selectSingleScopeItems(
            skills,
            this.skillsConfig.sourceScopes,
            skill => this.resolveSkillSourceScope(skill),
            this.getTopicScopeOverride(ctx, 'skills')
          )
        : {items: [] as readonly SkillPrompt[]}

    const allRules = rules ?? []
    const activeRuleScopes = this.ruleOutputEnabled && allRules.length > 0 ? new Set(this.selectRuleScopes(ctx, allRules)) : new Set<OutputDeclarationScope>()
    const rulesByScope: Record<OutputDeclarationScope, RulePrompt[]> = {
      project: [],
      global: []
    }
    for (const rule of allRules) {
      const ruleScope = this.normalizeSourceScope(this.normalizeRuleScope(rule))
      rulesByScope[ruleScope].push(rule)
    }

    if (globalMemory != null && activePromptScopes.has('global')) {
      declarations.push({
        path: this.joinPath(this.getGlobalSteeringDir(), GLOBAL_MEMORY_FILE),
        scope: 'global',
        source: {
          kind: 'globalMemory',
          content: globalMemory.content as string
        } satisfies TraeOutputSource
      })

      if (this.enableTraeCn) {
        declarations.push({
          path: this.joinPath(this.getGlobalUserRulesDir(), GLOBAL_MEMORY_FILE),
          scope: 'global',
          source: {
            kind: 'globalMemoryCn',
            content: globalMemory.content as string
          } satisfies TraeOutputSource
        })
      }
    }

    if (activeRuleScopes.has('project')) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue
        const projectRules = applySubSeriesGlobPrefix(filterByProjectConfig(rulesByScope.project, project.projectConfig, 'rules'), project.projectConfig)
        this.appendRuleDeclarations(declarations, projectBase, 'project', projectRules)
      }
    }

    const pushSkillDeclarations = (baseDir: string, scope: 'project' | 'global', filteredSkills: readonly SkillPrompt[]): void => {
      this.appendSkillDeclarations(declarations, baseDir, scope, filteredSkills, {
        skillSubDir: SKILLS_SUBDIR,
        buildSkillReferenceSource: childDoc => ({
          kind: 'skillChildDoc',
          content: childDoc.content as string
        })
      })
    }

    if (selectedSkills.selectedScope === 'project') {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue
        const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
        pushSkillDeclarations(projectBase, 'project', filteredSkills)
      }
    }

    if (selectedSkills.selectedScope === 'global') {
      const baseDir = this.getGlobalConfigDir()
      const filteredSkills = filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
      pushSkillDeclarations(baseDir, 'global', filteredSkills)
    }

    for (const ruleScope of ['global'] as const) {
      if (!activeRuleScopes.has(ruleScope)) continue
      const basePath = this.getGlobalConfigDir()
      const filteredRules = applySubSeriesGlobPrefix(
        filterByProjectConfig(rulesByScope[ruleScope], promptSourceProjectConfig, 'rules'),
        promptSourceProjectConfig
      )
      this.appendRuleDeclarations(declarations, basePath, ruleScope, filteredRules)
    }

    const ignoreOutputPath = this.getIgnoreOutputPath()
    const ignoreFile = this.indexignore == null ? void 0 : aiAgentIgnoreConfigFiles?.find(file => file.fileName === this.indexignore)
    if (ignoreOutputPath != null && ignoreFile != null) {
      for (const project of concreteProjects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null || project.isPromptSourceProject === true) continue
        declarations.push({
          path: path.join(projectDir.basePath, projectDir.path, ignoreOutputPath),
          scope: 'project',
          source: {
            kind: 'ignoreFile',
            content: ignoreFile.content
          } satisfies TraeOutputSource
        })
      }
    }

    return declarations
  }

  override async convertContent(declaration: OutputFileDeclaration, ctx: OutputWriteContext): Promise<string | Buffer> {
    const source = declaration.source as TraeOutputSource
    switch (source.kind) {
      case 'globalMemory':
      case 'globalMemoryCn':
      case 'skillChildDoc':
      case 'ignoreFile':
        return source.content
      case 'rule':
        return this.buildRuleContent(source.rule, ctx)
      case 'skillMain': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return this.buildMarkdownContent(source.skill.content as string, frontMatterData, ctx)
      }
      case 'skillResource':
        return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      default:
        throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  protected override buildSkillFrontMatter(skill: SkillPrompt): Record<string, unknown> {
    const fm: Record<string, unknown> = {
      description: skill.yamlFrontMatter.description ?? ''
    }

    if (skill.yamlFrontMatter.displayName != null) fm['name'] = skill.yamlFrontMatter.displayName

    return fm
  }

  protected override buildRuleContent(rule: RulePrompt, ctx: OutputWriteContext): string {
    const frontMatterData: Record<string, unknown> = {
      globs: rule.globs.join(', ')
    }

    if (rule.scope != null) {
      frontMatterData['scope'] = rule.scope
    }

    if (rule.seriName != null) {
      frontMatterData['seriName'] = rule.seriName
    }

    return this.buildMarkdownContent(rule.content, frontMatterData, ctx)
  }
}
