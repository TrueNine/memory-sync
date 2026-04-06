import type {
  CommandPrompt,
  OutputFileDeclaration,
  OutputWriteContext,
  ProjectChildrenMemoryPrompt,
  SkillPrompt
} from './plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {AbstractOutputPlugin, filterByProjectConfig} from './plugin-core'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.trae'
const STEERING_SUBDIR = 'steering'
const RULES_SUBDIR = 'rules'
const COMMANDS_SUBDIR = 'commands'
const SKILLS_SUBDIR = 'skills'

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
      treatWorkspaceRootProjectAsProject: true,
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
          global: {
            dirs: ['.trae/steering', '.trae/commands', '.trae/skills']
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

  protected override getIgnoreOutputPath(): string | undefined {
    if (this.indexignore == null) return void 0
    return path.join('.trae', '.ignore')
  }

  private getGlobalSteeringDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), STEERING_SUBDIR)
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {commands, skills, globalMemory, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const concreteProjects = this.getConcreteProjects(ctx)
    const promptProjects = this.getProjectPromptOutputProjects(ctx)
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))
    const selectedCommands = commands != null
      ? this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, command => this.resolveCommandSourceScope(command), this.getTopicScopeOverride(ctx, 'commands'))
      : {items: [] as readonly CommandPrompt[]}
    const selectedSkills = skills != null
      ? this.selectSingleScopeItems(skills, this.skillsConfig.sourceScopes, skill => this.resolveSkillSourceScope(skill), this.getTopicScopeOverride(ctx, 'skills'))
      : {items: [] as readonly SkillPrompt[]}
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})

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

    for (const project of promptProjects) {
      const projectBase = this.resolveProjectRootDir(ctx, project)
      if (projectBase == null) continue

      if (project.childMemoryPrompts != null && activePromptScopes.has('project')) {
        for (const child of project.childMemoryPrompts) {
          const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
          const normalizedChildPath = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '')
          const globPattern = this.buildProjectRelativeGlobPattern(normalizedChildPath)
          const steeringContent = this.buildMarkdownContent(
            [
              this.buildPathGuardHint(normalizedChildPath),
              '',
              child.content as string
            ].join('\n'),
            {alwaysApply: false, globs: globPattern},
            ctx
          )

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
    }

    if (selectedCommands.selectedScope === 'project') {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectBase = this.resolveProjectConfigDir(ctx, project)
        if (projectBase == null) continue

        const filteredCommands = filterByProjectConfig(selectedCommands.items, project.projectConfig, 'commands')
        this.appendCommandDeclarations(declarations, projectBase, 'project', filteredCommands, transformOptions)
      }
    }

    if (selectedCommands.selectedScope === 'global') {
      const baseDir = this.getGlobalConfigDir()
      const filteredCommands = filterByProjectConfig(selectedCommands.items, promptSourceProjectConfig, 'commands')
      this.appendCommandDeclarations(declarations, baseDir, 'global', filteredCommands, transformOptions)
    }

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
          } satisfies TraeOutputSource
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as TraeOutputSource
    switch (source.kind) {
      case 'globalMemory':
      case 'steeringRule':
      case 'skillChildDoc':
      case 'ignoreFile': return source.content
      case 'command': return this.buildCommandContent(source.command, ctx)
      case 'skillMain': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return this.buildMarkdownContent(source.skill.content as string, frontMatterData, ctx)
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

  private buildPathGuardHint(normalizedChildPath: string): string {
    if (normalizedChildPath.length === 0) {
      return 'Scope guard: apply this rule to project source files only; do not apply to generated output directories (for example dist/, build/, out/, .next/, target/).'
    }

    return [
      `Scope guard: this rule is for the project-root path "${normalizedChildPath}/" only.`,
      `Do not apply this rule to generated output paths such as "dist/${normalizedChildPath}/", "build/${normalizedChildPath}/", "out/${normalizedChildPath}/", ".next/${normalizedChildPath}/", or "target/${normalizedChildPath}/".`
    ].join('\n')
  }

  private buildProjectRelativeGlobPattern(normalizedChildPath: string): string {
    if (normalizedChildPath.length === 0) return '**/*'
    return `${normalizedChildPath}/**`
  }
}
