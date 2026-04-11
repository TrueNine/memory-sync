import type {CommandPrompt, OutputFileDeclaration, OutputWriteContext, RulePrompt, SkillPrompt} from './adaptor-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {
  AbstractOutputAdaptor,
  ADAPTOR_NAMES,
  applySubSeriesGlobPrefix,
  filterByProjectConfig,
  IgnoreFiles,
  OutputDeclarationScopeKind,
  PromptKind
} from './adaptor-core'

const CODEIUM_WINDSURF_DIR = '.codeium/windsurf'
const WORKFLOWS_SUBDIR = 'global_workflows'
const PROJECT_WORKFLOWS_SUBDIR = 'workflows'
const MEMORIES_SUBDIR = 'memories'
const GLOBAL_MEMORY_FILE = 'global_rules.md'
const SKILLS_SUBDIR = 'skills'
const WINDSURF_RULES_DIR = '.windsurf'
const WINDSURF_RULES_SUBDIR = 'rules'
const RULE_FILE_PREFIX = 'rule-'
const WINDSURF_IGNORE_FILES = [IgnoreFiles.WINDSURF, IgnoreFiles.WINDSURF_LEGACY] as const
const LEGACY_WINDSURF_IGNORE_FILE = IgnoreFiles.WINDSURF_LEGACY

type WindsurfOutputSource
  = | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'rule', readonly rule: RulePrompt}
    | {readonly kind: 'ignoreFile', readonly content: string}

export class WindsurfOutputAdaptor extends AbstractOutputAdaptor {
  constructor() {
    super('WindsurfOutputAdaptor', {
      globalConfigDir: CODEIUM_WINDSURF_DIR,
      outputFileName: '',
      treatWorkspaceRootProjectAsProject: true,
      dependsOn: [ADAPTOR_NAMES.AgentsOutput],
      indexignore: IgnoreFiles.WINDSURF,
      commands: {
        subDir: WORKFLOWS_SUBDIR,
        transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
      },
      skills: {
        subDir: SKILLS_SUBDIR
      },
      rules: {
        sourceScopes: ['project', 'global']
      },
      cleanup: {
        delete: {
          project: {
            files: [IgnoreFiles.WINDSURF, LEGACY_WINDSURF_IGNORE_FILE],
            dirs: ['.windsurf/rules', '.windsurf/workflows', '.windsurf/global_workflows', '.windsurf/skills', '.codeium/windsurf/global_workflows', '.codeium/windsurf/skills']
          },
          global: {
            dirs: ['.codeium/windsurf/global_workflows', '.codeium/windsurf/memories', '.codeium/windsurf/skills']
          }
        }
      },
      capabilities: {
        prompt: {
          scopes: ['global'],
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
        }
      }
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {commands, skills, globalMemory, rules, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const globalBase = this.getCodeiumWindsurfDir()
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['global']))
    const selectedCommands = commands != null
      ? this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, command => this.resolveCommandSourceScope(command), this.getTopicScopeOverride(ctx, 'commands'))
      : {items: [] as readonly CommandPrompt[]}
    const selectedSkills = skills != null
      ? this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
      : {items: [] as readonly SkillPrompt[]}
    const concreteProjects = this.getConcreteProjects(ctx)

    if (globalMemory != null && activePromptScopes.has('global')) {
      declarations.push({
        path: path.join(globalBase, MEMORIES_SUBDIR, GLOBAL_MEMORY_FILE),
        scope: 'global',
        source: {
          kind: 'globalMemory',
          content: globalMemory.content as string
        } satisfies WindsurfOutputSource
      })
    }

    if (selectedSkills.selectedScope === OutputDeclarationScopeKind.Project) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        const projectBase = projectRootDir == null ? void 0 : path.join(projectRootDir, WINDSURF_RULES_DIR)
        if (projectBase == null) continue
        const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
        this.appendSkillDeclarations(
          declarations,
          projectBase,
          OutputDeclarationScopeKind.Project,
          filteredSkills,
          {
            skillSubDir: SKILLS_SUBDIR,
            buildSkillReferenceSource: childDoc => ({
              kind: PromptKind.SkillChildDoc,
              content: childDoc.content as string
            })
          }
        )
      }
    }

    if (selectedSkills.selectedScope === OutputDeclarationScopeKind.Global) {
      const filteredSkills = filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
      this.appendSkillDeclarations(
        declarations,
        globalBase,
        OutputDeclarationScopeKind.Global,
        filteredSkills,
        {
          skillSubDir: SKILLS_SUBDIR,
          buildSkillReferenceSource: childDoc => ({
            kind: PromptKind.SkillChildDoc,
            content: childDoc.content as string
          })
        }
      )
    }

    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    if (selectedCommands.selectedScope === OutputDeclarationScopeKind.Project) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        const projectBase = projectRootDir == null ? void 0 : path.join(projectRootDir, WINDSURF_RULES_DIR)
        if (projectBase == null) continue
        const filteredCommands = filterByProjectConfig(selectedCommands.items, project.projectConfig, 'commands')
        for (const command of filteredCommands) {
          declarations.push({
            path: path.join(projectBase, PROJECT_WORKFLOWS_SUBDIR, this.transformCommandName(command, transformOptions)),
            scope: 'project',
            source: {kind: 'command', command} satisfies WindsurfOutputSource
          })
        }
      }
    }

    if (selectedCommands.selectedScope === OutputDeclarationScopeKind.Global) {
      const filteredCommands = filterByProjectConfig(selectedCommands.items, promptSourceProjectConfig, 'commands')
      this.appendCommandDeclarations(
        declarations,
        globalBase,
        OutputDeclarationScopeKind.Global,
        filteredCommands,
        transformOptions
      )
    }

    if (rules != null && rules.length > 0) {
      const activeRuleScopes = new Set(this.selectRuleScopes(ctx, rules))
      const globalRules = rules.filter(rule => this.normalizeSourceScope(this.normalizeRuleScope(rule)) === 'global')
      if (activeRuleScopes.has('global')) {
        for (const rule of globalRules) {
          declarations.push({
            path: path.join(globalBase, MEMORIES_SUBDIR, this.buildRuleFileName(rule)),
            scope: 'global',
            source: {kind: 'rule', rule} satisfies WindsurfOutputSource
          })
        }
      }

      if (activeRuleScopes.has('project')) {
        for (const project of this.getProjectOutputProjects(ctx)) {
          const projectRootDir = this.resolveProjectRootDir(ctx, project)
          if (projectRootDir == null) continue

          const projectRules = applySubSeriesGlobPrefix(
            filterByProjectConfig(rules.filter(rule => this.normalizeSourceScope(this.normalizeRuleScope(rule)) === 'project'), project.projectConfig, 'rules'),
            project.projectConfig
          )
          for (const rule of projectRules) {
            declarations.push({
              path: path.join(projectRootDir, WINDSURF_RULES_DIR, WINDSURF_RULES_SUBDIR, this.buildRuleFileName(rule)),
              scope: 'project',
              source: {kind: 'rule', rule} satisfies WindsurfOutputSource
            })
          }
        }
      }
    }

    const ignoreFilesByName = new Map(
      (aiAgentIgnoreConfigFiles ?? []).map(file => [file.fileName, file.content] as const)
    )
    if (ignoreFilesByName.size <= 0) return declarations

    const primaryIgnoreContent = ignoreFilesByName.get(IgnoreFiles.WINDSURF)
      ?? ignoreFilesByName.get(LEGACY_WINDSURF_IGNORE_FILE)
    const legacyIgnoreContent = ignoreFilesByName.get(LEGACY_WINDSURF_IGNORE_FILE)
      ?? ignoreFilesByName.get(IgnoreFiles.WINDSURF)
    for (const project of concreteProjects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null || project.isPromptSourceProject === true) continue

      for (const ignoreFileName of WINDSURF_IGNORE_FILES) {
        const content = ignoreFileName === IgnoreFiles.WINDSURF
          ? primaryIgnoreContent
          : legacyIgnoreContent
        if (content == null) continue

        declarations.push({
          path: path.join(projectDir.basePath, projectDir.path, ignoreFileName),
          scope: 'project',
          source: {
            kind: 'ignoreFile',
            content
          } satisfies WindsurfOutputSource
        })
      }
    }
    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as WindsurfOutputSource
    switch (source.kind) {
      case 'globalMemory':
      case 'skillChildDoc':
      case 'ignoreFile': return source.content
      case 'command': return this.buildCommandContent(source.command, ctx)
      case 'skillMain': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return this.buildMarkdownContent(source.skill.content as string, frontMatterData, ctx)
      }
      case 'skillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      case 'rule': return this.buildRuleContent(source.rule, ctx)
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  private getCodeiumWindsurfDir(): string { return path.join(this.getHomeDir(), CODEIUM_WINDSURF_DIR) }

  protected override buildRuleFileName(rule: RulePrompt, prefix: string = RULE_FILE_PREFIX): string {
    return `${prefix}${rule.prefix}-${rule.ruleName}.md`
  }

  protected override buildRuleContent(rule: RulePrompt, ctx?: OutputWriteContext): string {
    const fmData: Record<string, unknown> = {trigger: 'glob', globs: rule.globs.length > 0 ? rule.globs.join(', ') : ''}
    const raw = this.buildMarkdownContent(rule.content, fmData, ctx)
    const lines = raw.split('\n')
    return lines.map(line => {
      const match = /^(\s*globs:\s*)(['"])(.*)\2\s*$/.exec(line)
      if (match == null) return line
      const prefix = match[1] ?? 'globs: '
      const value = match[3] ?? ''
      if (value.trim().length === 0) return line
      return `${prefix}${value}`
    }).join('\n')
  }
}
