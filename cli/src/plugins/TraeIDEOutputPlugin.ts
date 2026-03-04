import type {
  CommandPrompt,
  OutputFileDeclaration,
  OutputWriteContext,
  ProjectChildrenMemoryPrompt,
  SkillPrompt
} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, filterByProjectConfig} from './plugin-core'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.trae'
const STEERING_SUBDIR = 'steering'
const RULES_SUBDIR = 'rules'
const COMMANDS_SUBDIR = 'commands'
const SKILLS_SUBDIR = 'skills'
const SKILL_FILE_NAME = 'SKILL.md'

type TraeOutputSource
  = | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'steeringRule', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
    | {readonly kind: 'ignoreFile', readonly content: string}

export class TraeIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('TraeIDEOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      indexignore: '.traeignore',
      commands: {
        subDir: COMMANDS_SUBDIR,
        transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
      },
      skills: {
        subDir: SKILLS_SUBDIR
      },
      cleanup: {
        delete: {
          project: {
            dirs: ['.trae/rules', '.trae/commands', '.trae/skills']
          },
          workspace: {
            dirs: ['.trae/commands', '.trae/skills']
          },
          global: {
            dirs: ['.trae/steering']
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

  protected override getIgnoreOutputPath(): string | undefined {
    if (this.indexignore == null) return void 0
    return path.join('.trae', '.ignore')
  }

  private getGlobalSteeringDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), STEERING_SUBDIR)
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const {commands, skills, globalMemory, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))

    if (globalMemory != null && activePromptScopes.has('global')) {
      declarations.push({
        path: this.joinPath(this.getGlobalSteeringDir(), GLOBAL_MEMORY_FILE),
        scope: 'global',
        source: {
          kind: 'globalMemory',
          content: globalMemory.content as string
        } satisfies TraeOutputSource
      })
    }

    const scopedCommands = commands != null
      ? this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, cmd => this.resolveCommandSourceScope(cmd), this.getTopicScopeOverride(ctx, 'commands'))
      : {items: [] as readonly CommandPrompt[]}
    const filteredCommands = filterByProjectConfig(scopedCommands.items, projectConfig, 'commands')
    const scopedSkills = skills != null
      ? this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
      : {items: [] as readonly SkillPrompt[]}
    const filteredSkills = filterByProjectConfig(scopedSkills.items, projectConfig, 'skills')
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      const projectBase = path.join(projectDir.basePath, projectDir.path)

      if (project.childMemoryPrompts != null && activePromptScopes.has('project')) {
        for (const child of project.childMemoryPrompts) {
          const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
          const globPattern = `${childPath.replaceAll('\\', '/')}/**`
          const steeringContent = [
            '---',
            'alwaysApply: false',
            `globs: ${globPattern}`,
            '---',
            '',
            child.content
          ].join('\n')

          declarations.push({
            path: path.join(projectBase, GLOBAL_CONFIG_DIR, RULES_SUBDIR, this.buildSteeringFileName(child)),
            scope: 'project',
            source: {
              kind: 'steeringRule',
              content: steeringContent
            } satisfies TraeOutputSource
          })
        }
      }

      for (const cmd of filteredCommands) {
        const fileName = this.transformCommandName(cmd, transformOptions)
        declarations.push({
          path: path.join(projectBase, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR, fileName),
          scope: 'project',
          source: {kind: 'command', command: cmd} satisfies TraeOutputSource
        })
      }

      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        const skillDir = path.join(projectBase, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName)
        declarations.push({
          path: path.join(skillDir, SKILL_FILE_NAME),
          scope: 'project',
          source: {kind: 'skillMain', skill} satisfies TraeOutputSource
        })

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            declarations.push({
              path: path.join(skillDir, childDoc.relativePath.replace(/\.mdx$/, '.md')),
              scope: 'project',
              source: {
                kind: 'skillChildDoc',
                content: childDoc.content as string
              } satisfies TraeOutputSource
            })
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            declarations.push({
              path: path.join(skillDir, resource.relativePath),
              scope: 'project',
              source: {
                kind: 'skillResource',
                content: resource.content,
                encoding: resource.encoding
              } satisfies TraeOutputSource
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
      for (const project of projects) {
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

  override async convertContent(
    declaration: OutputFileDeclaration,
    _ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as TraeOutputSource
    switch (source.kind) {
      case 'globalMemory':
      case 'steeringRule':
      case 'skillChildDoc':
      case 'ignoreFile': return source.content
      case 'command': return this.buildCommandContent(source.command)
      case 'skillMain': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return buildMarkdownWithFrontMatter(frontMatterData, source.skill.content as string)
      }
      case 'skillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }

  protected override buildSkillFrontMatter(skill: SkillPrompt): Record<string, unknown> {
    const fm: Record<string, unknown> = {
      description: skill.yamlFrontMatter.description ?? ''
    }

    if (skill.yamlFrontMatter.displayName != null) fm['name'] = skill.yamlFrontMatter.displayName

    return fm
  }

  private buildSteeringFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '').replaceAll('/', '-')
    return `trae-${normalized}.md`
  }
}
