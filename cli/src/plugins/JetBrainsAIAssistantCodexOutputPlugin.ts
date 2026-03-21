import type {
  CommandPrompt,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputFileDeclaration,
  OutputPluginContext,
  OutputWriteContext,
  ProjectChildrenMemoryPrompt,
  SkillPrompt
} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {AbstractOutputPlugin, filterByProjectConfig, PLUGIN_NAMES} from './plugin-core'

const PROJECT_MEMORY_FILE = 'AGENTS.md'
const PROMPTS_SUBDIR = 'prompts'
const SKILLS_SUBDIR = 'skills'
const SKILL_FILE_NAME = 'SKILL.md'
const AIASSISTANT_DIR = '.aiassistant'
const CODEX_DIR = 'codex'
const RULES_SUBDIR = 'rules'
const ROOT_RULE_FILE = 'always.md'
const CHILD_RULE_FILE_PREFIX = 'glob-'
const RULE_APPLY_ALWAYS = '始终'
const RULE_APPLY_GLOB = '按文件模式'
const RULE_GLOB_KEY = '模式'
type JetBrainsCodexOutputSource
  = | {readonly kind: 'projectRuleContent', readonly content: string}
    | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'skill', readonly skill: SkillPrompt}
    | {readonly kind: 'skillReference', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'ignoreFile', readonly content: string}

export class JetBrainsAIAssistantCodexOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('JetBrainsAIAssistantCodexOutputPlugin', {
      outputFileName: PROJECT_MEMORY_FILE,
      treatWorkspaceRootProjectAsProject: true,
      commands: {
        subDir: PROMPTS_SUBDIR,
        transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
      },
      skills: {
        subDir: SKILLS_SUBDIR
      },
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      indexignore: '.aiignore',
      cleanup: {
        delete: {
          project: {
            dirs: ['.aiassistant/rules', '.aiassistant/codex/prompts', '.aiassistant/codex/skills']
          }
        }
      },
      capabilities: {
        prompt: {
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
    const {globalMemory, commands, skills, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const concreteProjects = this.getConcreteProjects(ctx)
    const promptProjects = this.getProjectPromptOutputProjects(ctx)
    const codexDirs = this.getJetBrainsCodexDirs(ctx)
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const selectedCommands = commands != null
      ? this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, command => this.resolveCommandSourceScope(command), this.getTopicScopeOverride(ctx, 'commands'))
      : {items: [] as readonly CommandPrompt[]}
    const selectedSkills = skills != null
      ? this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
      : {items: [] as readonly SkillPrompt[]}
    const transformOptions = this.getTransformOptionsFromContext(ctx)

    if (activePromptScopes.has('project')) {
      for (const project of promptProjects) {
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        if (projectRootDir == null) continue
        const rulesDir = path.join(projectRootDir, AIASSISTANT_DIR, RULES_SUBDIR)

        if (project.rootMemoryPrompt != null) {
          declarations.push({
            path: path.join(rulesDir, ROOT_RULE_FILE),
            scope: 'project',
            source: {
              kind: 'projectRuleContent',
              content: this.buildAlwaysRuleContent(project.rootMemoryPrompt.content as string, ctx)
            } satisfies JetBrainsCodexOutputSource
          })
        }

        if (project.childMemoryPrompts != null) {
          for (const child of project.childMemoryPrompts) {
            declarations.push({
              path: path.join(rulesDir, this.buildChildRuleFileName(child)),
              scope: 'project',
              source: {
                kind: 'projectRuleContent',
                content: this.buildGlobRuleContent(child, ctx)
              } satisfies JetBrainsCodexOutputSource
            })
          }
        }
      }
    }

    const pushSkillDeclarations = (
      basePath: string,
      scope: 'project' | 'global',
      filteredSkills: readonly SkillPrompt[]
    ): void => {
      for (const skill of filteredSkills) {
        const skillName = this.getSkillName(skill)
        const skillDir = path.join(basePath, SKILLS_SUBDIR, skillName)
        declarations.push({
          path: path.join(skillDir, SKILL_FILE_NAME),
          scope,
          source: {kind: 'skill', skill} satisfies JetBrainsCodexOutputSource
        })

        if (skill.childDocs != null) {
          for (const refDoc of skill.childDocs) {
            declarations.push({
              path: path.join(skillDir, refDoc.dir.path.replace(/\.mdx$/, '.md')),
              scope,
              source: {
                kind: 'skillReference',
                content: refDoc.content as string
              } satisfies JetBrainsCodexOutputSource
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
              } satisfies JetBrainsCodexOutputSource
            })
          }
        }
      }
    }

    if (selectedCommands.selectedScope === 'project' || selectedSkills.selectedScope === 'project') {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        if (projectRootDir == null) continue

        const projectCodexDir = path.join(projectRootDir, AIASSISTANT_DIR, CODEX_DIR)
        if (selectedCommands.selectedScope === 'project') {
          const filteredCommands = filterByProjectConfig(selectedCommands.items, project.projectConfig, 'commands')
          for (const command of filteredCommands) {
            declarations.push({
              path: path.join(projectCodexDir, PROMPTS_SUBDIR, this.transformCommandName(command, transformOptions)),
              scope: 'project',
              source: {kind: 'command', command} satisfies JetBrainsCodexOutputSource
            })
          }
        }

        if (selectedSkills.selectedScope === 'project') {
          const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
          pushSkillDeclarations(projectCodexDir, 'project', filteredSkills)
        }
      }
    }

    if (codexDirs.length > 0) {
      if (globalMemory != null && activePromptScopes.has('global')) {
        for (const codexDir of codexDirs) {
          declarations.push({
            path: path.join(codexDir, PROJECT_MEMORY_FILE),
            scope: 'global',
            source: {
              kind: 'globalMemory',
              content: globalMemory.content as string
            } satisfies JetBrainsCodexOutputSource
          })
        }
      }

      const filteredCommands = selectedCommands.selectedScope === 'global'
        ? filterByProjectConfig(selectedCommands.items, promptSourceProjectConfig, 'commands')
        : []
      const filteredSkills = selectedSkills.selectedScope === 'global'
        ? filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
        : []
      for (const codexDir of codexDirs) {
        for (const command of filteredCommands) {
          declarations.push({
            path: path.join(codexDir, PROMPTS_SUBDIR, this.transformCommandName(command, transformOptions)),
            scope: 'global',
            source: {kind: 'command', command} satisfies JetBrainsCodexOutputSource
          })
        }

        pushSkillDeclarations(codexDir, 'global', filteredSkills)
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
          } satisfies JetBrainsCodexOutputSource
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as JetBrainsCodexOutputSource
    switch (source.kind) {
      case 'projectRuleContent':
      case 'globalMemory':
      case 'skillReference':
      case 'ignoreFile': return source.content
      case 'command': return this.buildCommandContent(source.command, ctx)
      case 'skill': return this.buildCodexSkillContent(source.skill, ctx)
      case 'skillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  override async declareCleanupPaths(ctx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
    const baseDeclarations = await super.declareCleanupPaths(ctx)
    const codexDirs = this.getJetBrainsCodexDirs(ctx)
    if (codexDirs.length === 0) return baseDeclarations

    const dynamicGlobalDeletes = codexDirs.flatMap(codexDir => ([
      {path: path.join(codexDir, PROJECT_MEMORY_FILE), kind: 'file', scope: 'global'},
      {path: path.join(codexDir, PROMPTS_SUBDIR), kind: 'directory', scope: 'global'},
      {path: path.join(codexDir, SKILLS_SUBDIR), kind: 'directory', scope: 'global'}
    ] as const))
    const baseDeletes = baseDeclarations.delete ?? []

    return {
      ...baseDeclarations,
      delete: [
        ...baseDeletes,
        ...dynamicGlobalDeletes
      ]
    }
  }

  private getJetBrainsCodexDirs(ctx: OutputPluginContext | OutputWriteContext | OutputCleanContext): readonly string[] {
    return ctx.runtimeTargets.jetbrainsCodexDirs
  }

  private buildChildRuleFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath
      .replaceAll('\\', '/')
      .replaceAll(/^\/+|\/+$/g, '')
      .replaceAll('/', '-')

    const suffix = normalizedPath.length > 0 ? normalizedPath : 'root'
    return `${CHILD_RULE_FILE_PREFIX}${suffix}.md`
  }

  private buildChildRulePattern(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath
      .replaceAll('\\', '/')
      .replaceAll(/^\/+|\/+$/g, '')

    if (normalizedPath.length === 0) return '**/*'
    return `${normalizedPath}/**`
  }

  private buildAlwaysRuleContent(content: string, ctx: OutputWriteContext): string {
    const fmData: Record<string, unknown> = {
      apply: RULE_APPLY_ALWAYS
    }

    return this.buildMarkdownContent(content, fmData, ctx)
  }

  private buildGlobRuleContent(child: ProjectChildrenMemoryPrompt, ctx: OutputWriteContext): string {
    const pattern = this.buildChildRulePattern(child)
    const fmData: Record<string, unknown> = {
      apply: RULE_APPLY_GLOB,
      [RULE_GLOB_KEY]: pattern
    }

    return this.buildMarkdownContent(child.content as string, fmData, ctx)
  }

  private buildCodexSkillContent(skill: SkillPrompt, ctx: OutputWriteContext): string {
    const fm = skill.yamlFrontMatter

    const name = this.normalizeSkillName(this.getSkillName(skill), 64)
    const description = this.normalizeToSingleLine(fm.description, 1024)

    const metadata: Record<string, unknown> = {}

    if (fm.displayName != null) metadata['short-description'] = fm.displayName
    if (fm.version != null) metadata['version'] = fm.version
    if (fm.author != null) metadata['author'] = fm.author
    if (fm.keywords != null && fm.keywords.length > 0) metadata['keywords'] = [...fm.keywords]

    const fmData: Record<string, unknown> = {
      name,
      description
    }

    if (Object.keys(metadata).length > 0) fmData['metadata'] = metadata
    if (fm.allowTools != null && fm.allowTools.length > 0) fmData['allowed-tools'] = fm.allowTools.join(' ')

    return this.buildMarkdownContent(skill.content as string, fmData, ctx)
  }

  private normalizeSkillName(name: string, maxLength: number): string {
    let normalized = name
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-+|-+$/g, '')

    if (normalized.length > maxLength) normalized = normalized.slice(0, maxLength).replace(/-+$/, '')

    return normalized
  }

  private normalizeToSingleLine(text: string, maxLength: number): string {
    const singleLine = text.replaceAll(/[\r\n]+/g, ' ').replaceAll(/\s+/g, ' ').trim()
    if (singleLine.length > maxLength) return `${singleLine.slice(0, maxLength - 3)}...`
    return singleLine
  }
}
