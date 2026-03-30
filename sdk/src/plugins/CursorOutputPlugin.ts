import type {
  CommandPrompt,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputFileDeclaration,
  OutputWriteContext,
  RulePrompt,
  SkillPrompt
} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {
  AbstractOutputPlugin,
  applySubSeriesGlobPrefix,
  collectMcpServersFromSkills,
  filterByProjectConfig,
  GlobalConfigDirs,
  IgnoreFiles,
  OutputFileNames,
  OutputSubdirectories,
  PLUGIN_NAMES,
  PreservedSkills,
  transformMcpConfigForCursor,
  transformMcpServerMap
} from './plugin-core'

const GLOBAL_CONFIG_DIR = GlobalConfigDirs.CURSOR
const MCP_CONFIG_FILE = OutputFileNames.MCP_CONFIG
const COMMANDS_SUBDIR = OutputSubdirectories.COMMANDS
const RULES_SUBDIR = OutputSubdirectories.RULES
const GLOBAL_RULE_FILE = OutputFileNames.CURSOR_GLOBAL_RULE
const SKILLS_CURSOR_SUBDIR = OutputSubdirectories.CURSOR_SKILLS
const SKILLS_PROJECT_SUBDIR = 'skills'
const SKILL_FILE_NAME = OutputFileNames.SKILL
const PRESERVED_SKILLS = PreservedSkills.CURSOR

type CursorOutputSource
  = | {readonly kind: 'command', readonly command: CommandPrompt}
    | {
      readonly kind: 'mcpConfig'
      readonly mcpServers: Record<string, Record<string, unknown>>
    }
    | {readonly kind: 'skill', readonly skill: SkillPrompt}
    | {readonly kind: 'skillMcpConfig', readonly rawContent: string}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {
      readonly kind: 'skillResource'
      readonly content: string
      readonly encoding: 'text' | 'base64'
    }
    | {readonly kind: 'globalRuleContent', readonly content: string}
    | {readonly kind: 'ruleMdc', readonly rule: RulePrompt}
    | {readonly kind: 'ignoreFile', readonly content: string}

export class CursorOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CursorOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: '',
      treatWorkspaceRootProjectAsProject: true,
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      indexignore: IgnoreFiles.CURSOR,
      commands: {
        subDir: COMMANDS_SUBDIR,
        transformFrontMatter: (_cmd, context) =>
          context.sourceFrontMatter ?? {}
      },
      skills: {
        subDir: SKILLS_CURSOR_SUBDIR
      },
      rules: {
        subDir: RULES_SUBDIR,
        prefix: 'rule',
        sourceScopes: ['project', 'global']
      },
      cleanup: {
        delete: {
          project: {
            files: ['.cursor/mcp.json'],
            dirs: ['.cursor/commands', '.cursor/rules'],
            globs: ['.cursor/skills/*', '.cursor/skills-cursor/*']
          },
          global: {
            files: ['.cursor/mcp.json'],
            dirs: ['.cursor/commands', '.cursor/rules'],
            globs: ['.cursor/skills-cursor/*']
          }
        },
        protect: {
          global: {
            dirs: Array.from(
              PRESERVED_SKILLS,
              skillName => `.cursor/skills-cursor/${skillName}`
            )
          }
        },
        excludeScanGlobs: Array.from(
          PRESERVED_SKILLS,
          skillName => `.cursor/skills-cursor/${skillName}/**`
        )
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
        },
        mcp: {
          scopes: ['project', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareCleanupPaths(
    ctx: OutputCleanContext
  ): Promise<OutputCleanupDeclarations> {
    const declarations = await super.declareCleanupPaths(ctx)
    return {
      ...declarations,
      delete: (declarations.delete ?? []).map(target => {
        if (target.kind !== 'glob') return target

        const normalizedPath = target.path.replaceAll('\\', '/')
        if (!normalizedPath.endsWith(`/.cursor/${SKILLS_CURSOR_SUBDIR}/*`))
        { return target }

        return {
          ...target,
          excludeBasenames: [...PRESERVED_SKILLS]
        }
      })
    }
  }

  override async declareOutputFiles(
    ctx: OutputWriteContext
  ): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {globalMemory, commands, skills, rules, aiAgentIgnoreConfigFiles}
      = ctx.collectedOutputContext
    const globalDir = this.getGlobalConfigDir()
    const promptSourceProjectConfig
      = this.resolvePromptSourceProjectConfig(ctx)
    const concreteProjects = this.getConcreteProjects(ctx)
    const promptProjects = this.getProjectPromptOutputProjects(ctx)
    const transformOptions = this.getTransformOptionsFromContext(ctx, {
      includeSeriesPrefix: true
    })
    const activePromptScopes = new Set(
      this.selectPromptScopes(ctx, ['global'])
    )
    const activeRuleScopes = new Set(
      rules != null ? this.selectRuleScopes(ctx, rules) : []
    )
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
            this.getTopicScopeOverride(ctx, 'mcp')
            ?? this.getTopicScopeOverride(ctx, 'skills')
          )
        : {items: [] as readonly SkillPrompt[]}
    const selectedCommands
      = commands != null
        ? this.selectSingleScopeItems(
            commands,
            this.commandsConfig.sourceScopes,
            command => this.resolveCommandSourceScope(command),
            this.getTopicScopeOverride(ctx, 'commands')
          )
        : {items: [] as readonly CommandPrompt[]}

    const pushSkillDeclarations = (
      baseDir: string,
      scope: 'project' | 'global',
      filteredSkills: readonly SkillPrompt[]
    ): void => {
      const skillsSubDir
        = scope === 'global' ? SKILLS_CURSOR_SUBDIR : SKILLS_PROJECT_SUBDIR
      for (const skill of filteredSkills) {
        const skillName = this.getSkillName(skill)
        if (this.isPreservedSkill(skillName)) continue

        const skillDir = path.join(baseDir, skillsSubDir, skillName)
        declarations.push({
          path: path.join(skillDir, SKILL_FILE_NAME),
          scope,
          source: {kind: 'skill', skill} satisfies CursorOutputSource
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
              } satisfies CursorOutputSource
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
              } satisfies CursorOutputSource
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
      const skillsSubDir
        = scope === 'global' ? SKILLS_CURSOR_SUBDIR : SKILLS_PROJECT_SUBDIR
      for (const skill of filteredMcpSkills) {
        if (skill.mcpConfig == null) continue

        const skillDir = path.join(
          baseDir,
          skillsSubDir,
          this.getSkillName(skill)
        )
        declarations.push({
          path: path.join(skillDir, MCP_CONFIG_FILE),
          scope,
          source: {
            kind: 'skillMcpConfig',
            rawContent: skill.mcpConfig.rawContent
          } satisfies CursorOutputSource
        })
      }
    }

    const pushMcpDeclaration = (
      baseDir: string,
      scope: 'project' | 'global',
      filteredSkills: readonly SkillPrompt[]
    ): void => {
      if (filteredSkills.length === 0) return

      const servers = collectMcpServersFromSkills(filteredSkills, this.log)
      if (servers.size === 0) return

      declarations.push({
        path: path.join(baseDir, MCP_CONFIG_FILE),
        scope,
        source: {
          kind: 'mcpConfig',
          mcpServers: transformMcpServerMap(
            servers,
            transformMcpConfigForCursor
          )
        } satisfies CursorOutputSource
      })
    }

    if (
      selectedSkills.selectedScope === 'project'
      || selectedMcpSkills.selectedScope === 'project'
    ) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const baseDir = this.resolveProjectConfigDir(ctx, project)
        if (baseDir == null) continue

        if (selectedSkills.selectedScope === 'project') {
          const filteredSkills = filterByProjectConfig(
            selectedSkills.items,
            project.projectConfig,
            'skills'
          )
          pushSkillDeclarations(baseDir, 'project', filteredSkills)
        }

        if (selectedMcpSkills.selectedScope === 'project') {
          const filteredMcpSkills = filterByProjectConfig(
            selectedMcpSkills.items,
            project.projectConfig,
            'skills'
          )
          pushSkillMcpDeclarations(baseDir, 'project', filteredMcpSkills)
          pushMcpDeclaration(baseDir, 'project', filteredMcpSkills)
        }
      }
    }

    if (
      selectedSkills.selectedScope === 'global'
      || selectedMcpSkills.selectedScope === 'global'
    ) {
      if (selectedSkills.selectedScope === 'global') {
        const filteredSkills = filterByProjectConfig(
          selectedSkills.items,
          promptSourceProjectConfig,
          'skills'
        )
        pushSkillDeclarations(globalDir, 'global', filteredSkills)
      }

      if (selectedMcpSkills.selectedScope === 'global') {
        const filteredMcpSkills = filterByProjectConfig(
          selectedMcpSkills.items,
          promptSourceProjectConfig,
          'skills'
        )
        pushSkillMcpDeclarations(globalDir, 'global', filteredMcpSkills)
        pushMcpDeclaration(globalDir, 'global', filteredMcpSkills)
      }
    }

    if (selectedCommands.selectedScope === 'project') {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const baseDir = this.resolveProjectConfigDir(ctx, project)
        if (baseDir == null) continue

        const filteredCommands = filterByProjectConfig(
          selectedCommands.items,
          project.projectConfig,
          'commands'
        )
        for (const command of filteredCommands) {
          declarations.push({
            path: path.join(
              baseDir,
              COMMANDS_SUBDIR,
              this.transformCommandName(command, transformOptions)
            ),
            scope: 'project',
            source: {kind: 'command', command} satisfies CursorOutputSource
          })
        }
      }
    }

    if (selectedCommands.selectedScope === 'global') {
      const filteredCommands = filterByProjectConfig(
        selectedCommands.items,
        promptSourceProjectConfig,
        'commands'
      )
      for (const command of filteredCommands) {
        declarations.push({
          path: path.join(
            globalDir,
            COMMANDS_SUBDIR,
            this.transformCommandName(command, transformOptions)
          ),
          scope: 'global',
          source: {kind: 'command', command} satisfies CursorOutputSource
        })
      }
    }

    if (rules != null && rules.length > 0) {
      const globalRules = rules.filter(
        rule =>
          this.normalizeSourceScope(this.normalizeRuleScope(rule)) === 'global'
      )
      if (activeRuleScopes.has('global')) {
        for (const rule of globalRules) {
          declarations.push({
            path: path.join(
              globalDir,
              RULES_SUBDIR,
              this.buildRuleFileName(rule)
            ),
            scope: 'global',
            source: {kind: 'ruleMdc', rule} satisfies CursorOutputSource
          })
        }
      }

      if (activeRuleScopes.has('project')) {
        for (const project of this.getProjectOutputProjects(ctx)) {
          const projectBaseDir = this.resolveProjectConfigDir(ctx, project)
          if (projectBaseDir == null) continue
          const projectRules = applySubSeriesGlobPrefix(
            filterByProjectConfig(
              rules.filter(
                rule =>
                  this.normalizeSourceScope(this.normalizeRuleScope(rule))
                  === 'project'
              ),
              project.projectConfig,
              'rules'
            ),
            project.projectConfig
          )
          for (const rule of projectRules) {
            declarations.push({
              path: path.join(
                projectBaseDir,
                RULES_SUBDIR,
                this.buildRuleFileName(rule)
              ),
              scope: 'project',
              source: {kind: 'ruleMdc', rule} satisfies CursorOutputSource
            })
          }
        }
      }
    }

    if (globalMemory != null && activePromptScopes.has('global')) {
      const globalRuleContent = this.buildGlobalRuleContent(
        globalMemory.content as string,
        ctx
      )
      for (const project of promptProjects) {
        const projectBaseDir = this.resolveProjectConfigDir(ctx, project)
        if (projectBaseDir == null) continue
        declarations.push({
          path: path.join(projectBaseDir, RULES_SUBDIR, GLOBAL_RULE_FILE),
          scope: 'project',
          source: {
            kind: 'globalRuleContent',
            content: globalRuleContent
          } satisfies CursorOutputSource
        })
      }
    }

    const ignoreOutputPath = this.getIgnoreOutputPath()
    const ignoreFile
      = this.indexignore == null
        ? void 0
        : aiAgentIgnoreConfigFiles?.find(
            file => file.fileName === this.indexignore
          )
    if (ignoreOutputPath != null && ignoreFile != null) {
      for (const project of concreteProjects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null || project.isPromptSourceProject === true)
        { continue }
        declarations.push({
          path: path.join(
            projectDir.basePath,
            projectDir.path,
            ignoreOutputPath
          ),
          scope: 'project',
          source: {
            kind: 'ignoreFile',
            content: ignoreFile.content
          } satisfies CursorOutputSource
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as CursorOutputSource
    switch (source.kind) {
      case 'command':
        return this.buildCommandContent(source.command, ctx)
      case 'mcpConfig':
        return JSON.stringify({mcpServers: source.mcpServers}, null, 2)
      case 'skill': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return this.buildMarkdownContent(
          source.skill.content as string,
          frontMatterData,
          ctx
        )
      }
      case 'skillMcpConfig':
        return source.rawContent
      case 'skillChildDoc':
      case 'globalRuleContent':
      case 'ignoreFile':
        return source.content
      case 'skillResource':
        return source.encoding === 'base64'
          ? Buffer.from(source.content, 'base64')
          : source.content
      case 'ruleMdc':
        return this.buildRuleMdcContent(source.rule, ctx)
      default:
        throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  private buildGlobalRuleContent(
    content: string,
    ctx: OutputWriteContext
  ): string {
    return this.buildMarkdownContent(
      content,
      {description: 'Global prompt (synced)', alwaysApply: true},
      ctx
    )
  }

  private isPreservedSkill(name: string): boolean {
    return PRESERVED_SKILLS.has(name)
  }

  protected buildRuleMdcContent(
    rule: RulePrompt,
    ctx?: OutputWriteContext
  ): string {
    const fmData: Record<string, unknown> = {
      alwaysApply: false,
      globs: rule.globs.length > 0 ? rule.globs.join(', ') : ''
    }
    const raw = this.buildMarkdownContent(rule.content, fmData, ctx)
    const lines = raw.split('\n')
    const transformedLines = lines.map(line => {
      const match = /^(\s*globs:\s*)(['"])(.*)\2\s*$/.exec(line)
      if (match == null) return line
      const prefix = match[1] ?? 'globs: '
      const value = match[3] ?? ''
      if (value.trim().length === 0) return line
      return `${prefix}${value}`
    })
    return transformedLines.join('\n')
  }
}
