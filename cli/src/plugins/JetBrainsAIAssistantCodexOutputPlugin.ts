import type {
  CommandPrompt,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputFileDeclaration,
  OutputWriteContext,
  ProjectChildrenMemoryPrompt,
  SkillPrompt
} from './plugin-core'
import * as path from 'node:path'
import {getPlatformFixedDir} from '@truenine/desk-paths'
import {AbstractOutputPlugin, filterByProjectConfig, PLUGIN_NAMES} from './plugin-core'

/**
 * Represents the filename of the project memory file.
 */
const PROJECT_MEMORY_FILE = 'AGENTS.md'
/**
 * Specifies the name of the subdirectory where prompt files are stored.
 */
const PROMPTS_SUBDIR = 'prompts'
/**
 * Represents the name of the subdirectory where skill-related resources are stored.
 */
const SKILLS_SUBDIR = 'skills'
/**
 * The file name that represents the skill definition file.
 */
const SKILL_FILE_NAME = 'SKILL.md'
const AIASSISTANT_DIR = '.aiassistant'
const RULES_SUBDIR = 'rules'
const ROOT_RULE_FILE = 'always.md'
const CHILD_RULE_FILE_PREFIX = 'glob-'
const RULE_APPLY_ALWAYS = '\u59CB\u7EC8'
const RULE_APPLY_GLOB = '\u6309\u6587\u4EF6\u6A21\u5F0F'
const RULE_GLOB_KEY = '\u6A21\u5F0F'
/**
 * Represents the directory name used for storing JetBrains-related resources or files.
 */
const JETBRAINS_VENDOR_DIR = 'JetBrains'
/**
 * Represents the directory path where the AIA files are stored.
 */
const AIA_DIR = 'aia'
/**
 * Represents the directory path where the Codex-related files are stored.
 */
const CODEX_DIR = 'codex'

/**
 * An array of constant string literals representing the prefixes of JetBrains IDE directory names.
 */
const IDE_DIR_PREFIXES = [
  'IntelliJIdea',
  'WebStorm',
  'RustRover',
  'PyCharm',
  'PyCharmCE',
  'PhpStorm',
  'GoLand',
  'CLion',
  'DataGrip',
  'RubyMine',
  'Rider',
  'DataSpell',
  'Aqua'
] as const

type JetBrainsCodexOutputSource
  = | {readonly kind: 'projectRuleContent', readonly content: string}
    | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'globalSkill', readonly skill: SkillPrompt}
    | {readonly kind: 'skillReference', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string}
    | {readonly kind: 'ignoreFile', readonly content: string}

/**
 * Represents an output plugin specifically designed for integration with JetBrains AI Assistant Codex.
 */
export class JetBrainsAIAssistantCodexOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('JetBrainsAIAssistantCodexOutputPlugin', {
      outputFileName: PROJECT_MEMORY_FILE,
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
            dirs: ['.aiassistant/rules']
          }
        }
      },
      capabilities: {
        prompt: {
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
    const {workspace, globalMemory, commands, skills, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const {projects} = workspace
    const codexDirs = this.resolveCodexDirs()
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))

    if (activePromptScopes.has('project')) {
      for (const project of projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        const rulesDir = path.join(projectDir.basePath, projectDir.path, AIASSISTANT_DIR, RULES_SUBDIR)

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

    if (codexDirs.length > 0) {
      const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
      const scopedCommands = commands != null
        ? this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, cmd => this.resolveCommandSourceScope(cmd), this.getTopicScopeOverride(ctx, 'commands'))
        : {items: [] as readonly CommandPrompt[]}
      const filteredCommands = filterByProjectConfig(scopedCommands.items, projectConfig, 'commands')
      const scopedSkills = skills != null
        ? this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
        : {items: [] as readonly SkillPrompt[]}
      const filteredSkills = filterByProjectConfig(scopedSkills.items, projectConfig, 'skills')
      const transformOptions = this.getTransformOptionsFromContext(ctx)

      for (const codexDir of codexDirs) {
        if (globalMemory != null && activePromptScopes.has('global')) {
          declarations.push({
            path: path.join(codexDir, PROJECT_MEMORY_FILE),
            scope: 'global',
            source: {
              kind: 'globalMemory',
              content: globalMemory.content as string
            } satisfies JetBrainsCodexOutputSource
          })
        }

        for (const cmd of filteredCommands) {
          declarations.push({
            path: path.join(codexDir, PROMPTS_SUBDIR, this.transformCommandName(cmd, transformOptions)),
            scope: 'global',
            source: {kind: 'command', command: cmd} satisfies JetBrainsCodexOutputSource
          })
        }

        for (const skill of filteredSkills) {
          const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
          const skillDir = path.join(codexDir, SKILLS_SUBDIR, skillName)
          declarations.push({
            path: path.join(skillDir, SKILL_FILE_NAME),
            scope: 'global',
            source: {kind: 'globalSkill', skill} satisfies JetBrainsCodexOutputSource
          })

          if (skill.childDocs != null) {
            for (const refDoc of skill.childDocs) {
              declarations.push({
                path: path.join(skillDir, refDoc.dir.path.replace(/\.mdx$/, '.md')),
                scope: 'global',
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
                scope: 'global',
                source: {
                  kind: 'skillResource',
                  content: resource.content
                } satisfies JetBrainsCodexOutputSource
              })
            }
          }
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
          } satisfies JetBrainsCodexOutputSource
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string> {
    const source = declaration.source as JetBrainsCodexOutputSource
    switch (source.kind) {
      case 'projectRuleContent':
      case 'globalMemory':
      case 'skillReference':
      case 'skillResource':
      case 'ignoreFile': return source.content
      case 'command': return this.buildCommandContent(source.command, ctx)
      case 'globalSkill': return this.buildCodexSkillContent(source.skill, ctx)
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  override async declareCleanupPaths(ctx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
    const baseDeclarations = await super.declareCleanupPaths(ctx)
    const codexDirs = this.resolveCodexDirs()
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

  private resolveCodexDirs(): string[] {
    const baseDir = path.join(getPlatformFixedDir(), JETBRAINS_VENDOR_DIR)
    if (!this.existsSync(baseDir)) return []

    try {
      const dirents = this.readdirSync(baseDir, {withFileTypes: true})
      const ideDirs = dirents.filter(dirent => {
        if (!dirent.isDirectory()) return false
        return this.isSupportedIdeDir(dirent.name)
      })
      return ideDirs.map(dirent => path.join(baseDir, dirent.name, AIA_DIR, CODEX_DIR))
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.warn({action: 'scan', type: 'jetbrains', path: baseDir, error: errMsg})
      return []
    }
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

  private isSupportedIdeDir(dirName: string): boolean {
    return IDE_DIR_PREFIXES.some(prefix => dirName.startsWith(prefix))
  }

  private buildCodexSkillContent(skill: SkillPrompt, ctx: OutputWriteContext): string {
    const fm = skill.yamlFrontMatter

    const name = this.normalizeSkillName(fm.name, 64)
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
