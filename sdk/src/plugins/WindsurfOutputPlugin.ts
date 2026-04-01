import type {CommandPrompt, OutputFileDeclaration, OutputWriteContext, RulePrompt, SkillPrompt} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {AbstractOutputPlugin, applySubSeriesGlobPrefix, filterByProjectConfig, PLUGIN_NAMES} from './plugin-core'

const CODEIUM_WINDSURF_DIR = '.codeium/windsurf'
const WORKFLOWS_SUBDIR = 'global_workflows'
const PROJECT_WORKFLOWS_SUBDIR = 'workflows'
const MEMORIES_SUBDIR = 'memories'
const GLOBAL_MEMORY_FILE = 'global_rules.md'
const SKILLS_SUBDIR = 'skills'
const SKILL_FILE_NAME = 'SKILL.md'
const WINDSURF_RULES_DIR = '.windsurf'
const WINDSURF_RULES_SUBDIR = 'rules'
const RULE_FILE_PREFIX = 'rule-'

type WindsurfOutputSource
  = | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'rule', readonly rule: RulePrompt}
    | {readonly kind: 'ignoreFile', readonly content: string}

export class WindsurfOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('WindsurfOutputPlugin', {
      globalConfigDir: CODEIUM_WINDSURF_DIR,
      outputFileName: '',
      treatWorkspaceRootProjectAsProject: true,
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      indexignore: '.codeiumignore',
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

    const pushSkillDeclarations = (
      basePath: string,
      scope: 'project' | 'global',
      skill: SkillPrompt
    ): void => {
      const skillName = this.getSkillName(skill)
      const skillDir = path.join(basePath, SKILLS_SUBDIR, skillName)
      declarations.push({
        path: path.join(skillDir, SKILL_FILE_NAME),
        scope,
        source: {kind: 'skillMain', skill} satisfies WindsurfOutputSource
      })

      if (skill.childDocs != null) {
        for (const childDoc of skill.childDocs) {
          declarations.push({
            path: path.join(skillDir, childDoc.relativePath.replace(/\.mdx$/, '.md')),
            scope,
            source: {
              kind: 'skillChildDoc',
              content: childDoc.content as string
            } satisfies WindsurfOutputSource
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
            } satisfies WindsurfOutputSource
          })
        }
      }
    }

    if (selectedSkills.selectedScope === 'project') {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        const projectBase = projectRootDir == null ? void 0 : path.join(projectRootDir, WINDSURF_RULES_DIR)
        if (projectBase == null) continue
        const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
        for (const skill of filteredSkills) pushSkillDeclarations(projectBase, 'project', skill)
      }
    }

    if (selectedSkills.selectedScope === 'global') {
      const filteredSkills = filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
      for (const skill of filteredSkills) pushSkillDeclarations(globalBase, 'global', skill)
    }

    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    if (selectedCommands.selectedScope === 'project') {
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

    if (selectedCommands.selectedScope === 'global') {
      const filteredCommands = filterByProjectConfig(selectedCommands.items, promptSourceProjectConfig, 'commands')
      for (const command of filteredCommands) {
        declarations.push({
          path: path.join(globalBase, WORKFLOWS_SUBDIR, this.transformCommandName(command, transformOptions)),
          scope: 'global',
          source: {kind: 'command', command} satisfies WindsurfOutputSource
        })
      }
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

    const ignoreOutputPath = this.getIgnoreOutputPath()
    const ignoreFile = this.indexignore == null
      ? void 0
      : aiAgentIgnoreConfigFiles?.find(file => file.fileName === this.indexignore)
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
