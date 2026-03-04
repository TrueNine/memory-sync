import type {CommandPrompt, OutputFileDeclaration, OutputWriteContext, RuleContentOptions, RulePrompt, SkillPrompt} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
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
          workspace: {
            dirs: ['.codeium/windsurf/global_workflows', '.codeium/windsurf/skills']
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
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        },
        skills: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {workspace, commands, skills, globalMemory, rules, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const globalBase = this.getCodeiumWindsurfDir()
    const workspaceBase = this.resolveDirectoryPath(workspace.directory)
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['global']))
    const resolveScopedCodeiumWindsurfBasePath = (
      scope: 'project' | 'workspace' | 'global',
      projectDir?: {readonly basePath: string, readonly path: string}
    ): string | undefined => {
      if (scope === 'global') return globalBase
      if (scope === 'workspace') return path.join(workspaceBase, CODEIUM_WINDSURF_DIR)
      if (projectDir == null) return void 0
      return path.join(projectDir.basePath, projectDir.path, WINDSURF_RULES_DIR)
    }

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

    if (skills != null && skills.length > 0) {
      const scopedSkills = this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
      const pushSkillDeclarations = (basePath: string, scope: 'project' | 'workspace' | 'global', skill: SkillPrompt): void => {
        const skillName = skill.yamlFrontMatter.name
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

      if (scopedSkills.selectedScope === 'project') {
        for (const project of workspace.projects) {
          const projectDir = project.dirFromWorkspacePath
          const projectBase = resolveScopedCodeiumWindsurfBasePath('project', projectDir)
          if (projectBase == null) continue
          const filteredSkills = filterByProjectConfig(scopedSkills.items, project.projectConfig, 'skills')
          for (const skill of filteredSkills) pushSkillDeclarations(projectBase, 'project', skill)
        }
      } else if (scopedSkills.selectedScope != null) {
        const basePath = resolveScopedCodeiumWindsurfBasePath(scopedSkills.selectedScope)
        if (basePath != null) {
          const filteredSkills = filterByProjectConfig(scopedSkills.items, promptSourceProjectConfig, 'skills')
          for (const skill of filteredSkills) pushSkillDeclarations(basePath, scopedSkills.selectedScope, skill)
        }
      }
    }

    if (commands != null && commands.length > 0) {
      const scopedCommands = this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, cmd => this.resolveCommandSourceScope(cmd), this.getTopicScopeOverride(ctx, 'commands'))
      const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
      if (scopedCommands.selectedScope === 'project') {
        for (const project of workspace.projects) {
          const projectDir = project.dirFromWorkspacePath
          const projectBase = resolveScopedCodeiumWindsurfBasePath('project', projectDir)
          if (projectBase == null) continue
          const filteredCommands = filterByProjectConfig(scopedCommands.items, project.projectConfig, 'commands')
          for (const cmd of filteredCommands) {
            declarations.push({
              path: path.join(projectBase, PROJECT_WORKFLOWS_SUBDIR, this.transformCommandName(cmd, transformOptions)),
              scope: 'project',
              source: {kind: 'command', command: cmd} satisfies WindsurfOutputSource
            })
          }
        }
      } else if (scopedCommands.selectedScope != null) {
        const basePath = resolveScopedCodeiumWindsurfBasePath(scopedCommands.selectedScope)
        if (basePath != null) {
          const filteredCommands = filterByProjectConfig(scopedCommands.items, promptSourceProjectConfig, 'commands')
          for (const cmd of filteredCommands) {
            declarations.push({
              path: path.join(basePath, WORKFLOWS_SUBDIR, this.transformCommandName(cmd, transformOptions)),
              scope: scopedCommands.selectedScope,
              source: {kind: 'command', command: cmd} satisfies WindsurfOutputSource
            })
          }
        }
      }
    }

    if (rules != null && rules.length > 0) {
      const activeRuleScopes = new Set(this.selectRuleScopes(ctx, rules))
      const globalRules = rules.filter(r => this.normalizeSourceScope(this.normalizeRuleScope(r)) === 'global')
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
        for (const project of workspace.projects) {
          const projectDir = project.dirFromWorkspacePath
          if (projectDir == null) continue

          const projectRules = applySubSeriesGlobPrefix(
            filterByProjectConfig(rules.filter(r => this.normalizeSourceScope(this.normalizeRuleScope(r)) === 'project'), project.projectConfig, 'rules'),
            project.projectConfig
          )
          for (const rule of projectRules) {
            declarations.push({
              path: path.join(projectDir.basePath, projectDir.path, WINDSURF_RULES_DIR, WINDSURF_RULES_SUBDIR, this.buildRuleFileName(rule)),
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
      for (const project of workspace.projects) {
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
    _ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as WindsurfOutputSource
    switch (source.kind) {
      case 'globalMemory':
      case 'skillChildDoc':
      case 'ignoreFile': return source.content
      case 'command': return this.buildCommandContent(source.command)
      case 'skillMain': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return buildMarkdownWithFrontMatter(frontMatterData, source.skill.content as string)
      }
      case 'skillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      case 'rule': return this.buildRuleContent(source.rule)
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  private getCodeiumWindsurfDir(): string { return path.join(this.getHomeDir(), CODEIUM_WINDSURF_DIR) }

  protected override buildRuleFileName(rule: RulePrompt, prefix: string = RULE_FILE_PREFIX): string {
    return `${prefix}${rule.prefix}-${rule.ruleName}.md`
  }

  protected override buildRuleContent(rule: RulePrompt, _options?: RuleContentOptions): string {
    const fmData: Record<string, unknown> = {trigger: 'glob', globs: rule.globs.length > 0 ? rule.globs.join(', ') : ''}
    const raw = buildMarkdownWithFrontMatter(fmData, rule.content)
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
