import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  WriteResult,
  WriteResults
} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'
import * as path from 'node:path'
import {AbstractOutputPlugin} from '@truenine/plugin-output-shared'
import {filterCommandsByProjectConfig} from '@truenine/plugin-output-shared/utils'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.trae'
const STEERING_SUBDIR = 'steering'
const RULES_SUBDIR = 'rules'

export class TraeIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('TraeIDEOutputPlugin', {globalConfigDir: GLOBAL_CONFIG_DIR, outputFileName: GLOBAL_MEMORY_FILE, indexignore: '.traeignore'})
  }

  protected override getIgnoreOutputPath(): string | undefined {
    if (this.indexignore == null) return void 0
    return path.join('.trae', '.ignore')
  }

  private getGlobalSteeringDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), STEERING_SUBDIR)
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {projects} = ctx.collectedInputContext.workspace
    return projects
      .filter(p => p.dirFromWorkspacePath != null)
      .map(p => this.createRelativePath(
        this.joinPath(p.dirFromWorkspacePath!.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR),
        p.dirFromWorkspacePath!.basePath,
        () => RULES_SUBDIR
      ))
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {projects} = ctx.collectedInputContext.workspace
    const results: RelativePath[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null || project.childMemoryPrompts == null) continue
      for (const child of project.childMemoryPrompts) {
        results.push(this.createRelativePath(
          this.joinPath(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR, this.buildSteeringFileName(child)),
          project.dirFromWorkspacePath.basePath,
          () => RULES_SUBDIR
        ))
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(projects))
    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    return [
      this.createRelativePath(STEERING_SUBDIR, this.getGlobalConfigDir(), () => STEERING_SUBDIR)
    ]
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory, fastCommands} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const steeringDir = this.getGlobalSteeringDir()
    const results: RelativePath[] = []

    if (globalMemory != null) results.push(this.createRelativePath(GLOBAL_MEMORY_FILE, steeringDir, () => STEERING_SUBDIR))

    if (fastCommands == null) return results

    const filteredCommands = filterCommandsByProjectConfig(fastCommands, projectConfig)
    for (const cmd of filteredCommands) results.push(this.createRelativePath(this.buildFastCommandSteeringFileName(cmd), steeringDir, () => STEERING_SUBDIR))
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const hasChildPrompts = workspace.projects.some(p => (p.childMemoryPrompts?.length ?? 0) > 0)
    const hasTraeIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.traeignore') ?? false
    if (hasChildPrompts || globalMemory != null || (fastCommands?.length ?? 0) > 0 || hasTraeIgnore) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null || project.childMemoryPrompts == null) continue
      for (const child of project.childMemoryPrompts) fileResults.push(await this.writeSteeringFile(ctx, project, child))
    }

    const ignoreResults = await this.writeProjectIgnoreFiles(ctx)
    fileResults.push(...ignoreResults)

    return {files: fileResults, dirs: []}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, fastCommands} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []
    const steeringDir = this.getGlobalSteeringDir()

    if (globalMemory != null) {
      fileResults.push(await this.writeFile(ctx, this.joinPath(steeringDir, GLOBAL_MEMORY_FILE), globalMemory.content as string, 'globalMemory'))
    }

    if (fastCommands == null) return {files: fileResults, dirs: []}

    const filteredCommands = filterCommandsByProjectConfig(fastCommands, projectConfig)
    for (const cmd of filteredCommands) fileResults.push(await this.writeFastCommandSteeringFile(ctx, cmd))
    return {files: fileResults, dirs: []}
  }

  private buildFastCommandSteeringFileName(cmd: FastCommandPrompt): string {
    return this.transformFastCommandName(cmd, {includeSeriesPrefix: true, seriesSeparator: '-'})
  }

  private async writeFastCommandSteeringFile(ctx: OutputWriteContext, cmd: FastCommandPrompt): Promise<WriteResult> {
    const fileName = this.buildFastCommandSteeringFileName(cmd)
    const fullPath = this.joinPath(this.getGlobalSteeringDir(), fileName)
    const desc = cmd.yamlFrontMatter?.description
    const content = this.buildMarkdownContent(cmd.content, {
      inclusion: 'manual',
      description: desc != null && desc.length > 0 ? desc : null
    })
    return this.writeFile(ctx, fullPath, content, 'fastCommandSteering')
  }

  private buildSteeringFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '').replaceAll('/', '-')
    return `trae-${normalized}.md`
  }

  private async writeSteeringFile(ctx: OutputWriteContext, project: Project, child: ProjectChildrenMemoryPrompt): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const fileName = this.buildSteeringFileName(child)
    const targetDir = this.joinPath(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR)
    const fullPath = this.joinPath(targetDir, fileName)

    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const globPattern = `${childPath.replaceAll('\\', '/')}/**`

    const content = [
      '---',
      'alwaysApply: false',
      `globs: ${globPattern}`,
      '---',
      '',
      child.content
    ].join('\n')

    return this.writeFile(ctx, fullPath, content, 'steeringFile')
  }
}
