import type {
  CommandPrompt,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputCleanupPathDeclaration,
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
  filterByProjectConfig,
  GlobalConfigDirs,
  IgnoreFiles,
  McpConfigManager,
  OutputFileNames,
  OutputSubdirectories,
  PLUGIN_NAMES,
  PreservedSkills,
  transformMcpConfigForCursor
} from './plugin-core'

const GLOBAL_CONFIG_DIR = GlobalConfigDirs.CURSOR // Constants for local use (consider moving to constants.ts if used by multiple plugins)
const MCP_CONFIG_FILE = OutputFileNames.MCP_CONFIG
const COMMANDS_SUBDIR = OutputSubdirectories.COMMANDS
const RULES_SUBDIR = OutputSubdirectories.RULES
const GLOBAL_RULE_FILE = OutputFileNames.CURSOR_GLOBAL_RULE
const SKILLS_CURSOR_SUBDIR = OutputSubdirectories.CURSOR_SKILLS
const SKILL_FILE_NAME = OutputFileNames.SKILL
const PRESERVED_SKILLS = PreservedSkills.CURSOR

type CursorOutputSource
  = | {readonly kind: 'globalCommand', readonly command: CommandPrompt}
    | {readonly kind: 'globalMcpConfig', readonly mcpServers: Record<string, Record<string, unknown>>}
    | {readonly kind: 'globalSkill', readonly skill: SkillPrompt}
    | {readonly kind: 'globalSkillMcpConfig', readonly rawContent: string}
    | {readonly kind: 'globalSkillChildDoc', readonly content: string}
    | {readonly kind: 'globalSkillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'projectGlobalRule', readonly content: string}
    | {readonly kind: 'ruleMdc', readonly rule: RulePrompt}
    | {readonly kind: 'projectIgnoreFile', readonly content: string}

export class CursorOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CursorOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: '',
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      indexignore: IgnoreFiles.CURSOR,
      commands: {
        subDir: COMMANDS_SUBDIR,
        transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
      },
      skills: {
        subDir: SKILLS_CURSOR_SUBDIR
      },
      rules: {
        subDir: RULES_SUBDIR,
        prefix: 'rule', // Note: 'rule' not 'rule-' - linkSymbol adds the separator
        sourceScopes: ['project', 'global']
      },
      cleanup: {
        delete: {
          project: {
            dirs: ['.cursor/rules']
          },
          global: {
            files: ['.cursor/mcp.json'],
            dirs: ['.cursor/commands', '.cursor/rules'],
            globs: ['.cursor/skills-cursor/*']
          }
        },
        protect: {
          global: {
            dirs: [...PRESERVED_SKILLS].map(skillName => `.cursor/skills-cursor/${skillName}`)
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
        },
        mcp: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareCleanupPaths(ctx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
    const declarations = await super.declareCleanupPaths(ctx)
    return {
      ...declarations,
      delete: this.expandCursorSkillCleanupTargets(ctx, declarations.delete ?? [])
    }
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {workspace, globalMemory, commands, skills, rules, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const globalDir = this.getGlobalConfigDir()
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['global']))

    const scopedSkills = skills != null
      ? this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
      : {items: [] as readonly SkillPrompt[]}
    const filteredSkills = filterByProjectConfig(scopedSkills.items, projectConfig, 'skills')
    const scopedMcpSkills = skills != null
      ? this.selectSingleScopeItems(
          skills,
          this.skillsConfig.sourceScopes,
          skill => this.resolveSkillSourceScope(skill),
          this.getTopicScopeOverride(ctx, 'mcp') ?? this.getTopicScopeOverride(ctx, 'skills')
        )
      : {items: [] as readonly SkillPrompt[]}
    const filteredMcpSkills = filterByProjectConfig(scopedMcpSkills.items, projectConfig, 'skills')
    if (filteredSkills.length > 0) {
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        if (this.isPreservedSkill(skillName)) continue

        const skillDir = path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName)
        declarations.push({
          path: path.join(skillDir, SKILL_FILE_NAME),
          scope: 'global',
          source: {kind: 'globalSkill', skill} satisfies CursorOutputSource
        })

        if (skill.mcpConfig != null && filteredMcpSkills.includes(skill)) {
          declarations.push({
            path: path.join(skillDir, MCP_CONFIG_FILE),
            scope: 'global',
            source: {
              kind: 'globalSkillMcpConfig',
              rawContent: skill.mcpConfig.rawContent
            } satisfies CursorOutputSource
          })
        }

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            declarations.push({
              path: path.join(skillDir, childDoc.relativePath.replace(/\.mdx$/, '.md')),
              scope: 'global',
              source: {
                kind: 'globalSkillChildDoc',
                content: childDoc.content as string
              } satisfies CursorOutputSource
            })
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            declarations.push({
              path: path.join(skillDir, resource.relativePath),
              scope: 'global',
              source: {
                kind: 'globalSkillResource',
                content: resource.content,
                encoding: resource.encoding
              } satisfies CursorOutputSource
            })
          }
        }
      }
    }

    if (filteredMcpSkills.length > 0) {
      const manager = new McpConfigManager({fs: ctx.fs, logger: this.log})
      const servers = manager.collectMcpServers(filteredMcpSkills)
      if (servers.size > 0) {
        const transformed = manager.transformMcpServers(servers, transformMcpConfigForCursor)
        declarations.push({
          path: path.join(globalDir, MCP_CONFIG_FILE),
          scope: 'global',
          source: {kind: 'globalMcpConfig', mcpServers: transformed} satisfies CursorOutputSource
        })
      }
    }

    if (commands != null && commands.length > 0) {
      const scopedCommands = this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, cmd => this.resolveCommandSourceScope(cmd), this.getTopicScopeOverride(ctx, 'commands'))
      const filteredCommands = filterByProjectConfig(scopedCommands.items, projectConfig, 'commands')
      const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
      for (const cmd of filteredCommands) {
        const fileName = this.transformCommandName(cmd, transformOptions)
        declarations.push({
          path: path.join(globalDir, COMMANDS_SUBDIR, fileName),
          scope: 'global',
          source: {kind: 'globalCommand', command: cmd} satisfies CursorOutputSource
        })
      }
    }

    const activeRuleScopes = new Set(rules != null ? this.selectRuleScopes(ctx, rules) : [])

    const globalRules = rules?.filter(r => this.normalizeSourceScope(this.normalizeRuleScope(r)) === 'global')
    if (globalRules != null && activeRuleScopes.has('global')) {
      for (const rule of globalRules) {
        declarations.push({
          path: path.join(globalDir, RULES_SUBDIR, this.buildRuleFileName(rule)),
          scope: 'global',
          source: {kind: 'ruleMdc', rule} satisfies CursorOutputSource
        })
      }
    }

    if (globalMemory != null && activePromptScopes.has('global')) {
      const globalRuleContent = this.buildGlobalRuleContent(globalMemory.content as string, ctx)
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        declarations.push({
          path: path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR, GLOBAL_RULE_FILE),
          scope: 'project',
          source: {
            kind: 'projectGlobalRule',
            content: globalRuleContent
          } satisfies CursorOutputSource
        })
      }
    }

    if (rules != null && rules.length > 0 && activeRuleScopes.has('project')) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue

        const projectRules = applySubSeriesGlobPrefix(
          filterByProjectConfig(rules.filter(r => this.normalizeSourceScope(this.normalizeRuleScope(r)) === 'project'), project.projectConfig, 'rules'),
          project.projectConfig
        )
        for (const rule of projectRules) {
          declarations.push({
            path: path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR, this.buildRuleFileName(rule)),
            scope: 'project',
            source: {kind: 'ruleMdc', rule} satisfies CursorOutputSource
          })
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
            kind: 'projectIgnoreFile',
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
      case 'globalCommand': return this.buildCommandContent(source.command, ctx)
      case 'globalMcpConfig': return JSON.stringify({mcpServers: source.mcpServers}, null, 2)
      case 'globalSkill': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return this.buildMarkdownContent(source.skill.content as string, frontMatterData, ctx)
      }
      case 'globalSkillMcpConfig': return source.rawContent
      case 'globalSkillChildDoc':
      case 'projectGlobalRule':
      case 'projectIgnoreFile': return source.content
      case 'globalSkillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      case 'ruleMdc': return this.buildRuleMdcContent(source.rule, ctx)
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  private buildGlobalRuleContent(content: string, ctx: OutputWriteContext): string {
    return this.buildMarkdownContent(content, {description: 'Global prompt (synced)', alwaysApply: true}, ctx)
  }

  private isPreservedSkill(name: string): boolean { return PRESERVED_SKILLS.has(name) }

  private expandCursorSkillCleanupTargets(
    ctx: OutputCleanContext,
    declarations: readonly OutputCleanupPathDeclaration[]
  ): OutputCleanupPathDeclaration[] {
    const expanded: OutputCleanupPathDeclaration[] = []

    for (const declaration of declarations) {
      if (!this.isCursorSkillCleanupGlob(declaration)) {
        expanded.push(declaration)
        continue
      }

      for (const matchedTarget of this.listCursorSkillCleanupTargets(ctx, declaration.path)) {
        expanded.push({
          path: matchedTarget.path,
          kind: matchedTarget.kind,
          ...declaration.scope != null ? {scope: declaration.scope} : {},
          ...declaration.label != null ? {label: declaration.label} : {}
        })
      }
    }

    return expanded
  }

  private isCursorSkillCleanupGlob(declaration: OutputCleanupPathDeclaration): boolean {
    if (declaration.kind !== 'glob') return false

    const skillsGlob = this.joinPath(this.getGlobalConfigDir(), SKILLS_CURSOR_SUBDIR, '*')
      .replaceAll('\\', '/')

    return declaration.path.replaceAll('\\', '/') === skillsGlob
  }

  private listCursorSkillCleanupTargets(
    ctx: OutputCleanContext,
    pattern: string
  ): {path: string, kind: 'file' | 'directory'}[] {
    const matchedPaths = ctx.glob.sync(pattern.replaceAll('\\', '/'), {
      onlyFiles: false,
      dot: true,
      absolute: true,
      followSymbolicLinks: false
    })

    return matchedPaths.flatMap((matchedPath): {path: string, kind: 'file' | 'directory'}[] => {
      if (this.isPreservedSkill(path.basename(matchedPath))) return []

      try {
        const stat = ctx.fs.lstatSync(matchedPath)
        return [{path: matchedPath, kind: stat.isDirectory() ? 'directory' : 'file'}]
      }
      catch {
        return []
      }
    })
  }

  protected buildRuleMdcContent(rule: RulePrompt, ctx?: OutputWriteContext): string {
    const fmData: Record<string, unknown> = {alwaysApply: false, globs: rule.globs.length > 0 ? rule.globs.join(', ') : ''}
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
