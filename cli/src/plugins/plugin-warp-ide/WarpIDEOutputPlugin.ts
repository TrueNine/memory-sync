import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-core'
import {AbstractOutputPlugin} from '../plugin-core'
import {PLUGIN_NAMES} from '../plugin-core'

const PROJECT_MEMORY_FILE = 'WARP.md'

export class WarpIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('WarpIDEOutputPlugin', {outputFileName: PROJECT_MEMORY_FILE, indexignore: '.warpindexignore'})
  }

  private isAgentsPluginRegisteredInCtx(ctx: OutputPluginContext | OutputWriteContext): boolean {
    if ('registeredPluginNames' in ctx && ctx.registeredPluginNames != null) return ctx.registeredPluginNames.includes(PLUGIN_NAMES.AgentsOutput)
    return false
  }

  override async registerGlobalOutputDirs(): Promise<string[]> {
    return []
  }

  override async registerGlobalOutputFiles(): Promise<string[]> {
    return []
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const agentsRegistered = this.isAgentsPluginRegisteredInCtx(ctx)

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      if (agentsRegistered) {
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath.path, PROJECT_MEMORY_FILE)) // When AgentsOutputPlugin is registered, register WARP.md for global prompt output to each project
      } else {
        if (project.rootMemoryPrompt != null) results.push(this.createFileRelativePath(project.dirFromWorkspacePath.path, PROJECT_MEMORY_FILE)) // Normal mode: register files for projects with prompts

        if (project.childMemoryPrompts != null) {
          for (const child of project.childMemoryPrompts) {
            if (child.dir != null && this.isRelativePath(child.dir)) results.push(this.createFileRelativePath(child.dir.path, PROJECT_MEMORY_FILE))
          }
        }
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(projects))
    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const agentsRegistered = this.shouldSkipDueToPlugin(ctx, PLUGIN_NAMES.AgentsOutput)
    const {workspace, globalMemory, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext

    if (agentsRegistered) {
      if (globalMemory == null) { // When AgentsOutputPlugin is registered, only write if we have global memory
        this.log.debug('skipped', {reason: 'AgentsOutputPlugin registered but no global memory'})
        return false
      }
      return true
    }

    const hasProjectOutputs = workspace.projects.some( // Normal mode: check for project outputs
      p => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0
    )

    const hasWarpIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.warpindexignore') ?? false

    if (hasProjectOutputs || hasWarpIgnore) return true

    this.log.debug('skipped', {reason: 'no outputs to write'})
    return false
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const agentsRegistered = this.shouldSkipDueToPlugin(ctx, PLUGIN_NAMES.AgentsOutput)
    const {workspace, globalMemory} = ctx.collectedInputContext
    const {projects} = workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (agentsRegistered) {
      if (globalMemory != null) {
        for (const project of projects) {
          const projectDir = project.dirFromWorkspacePath
          if (projectDir == null) continue

          const projectName = project.name ?? 'unknown'
          const result = await this.writePromptFile(ctx, projectDir, globalMemory.content as string, `project:${projectName}/global-warp`)
          fileResults.push(result)
        }
      }

      const ignoreResults = await this.writeProjectIgnoreFiles(ctx)
      fileResults.push(...ignoreResults)

      return {files: fileResults, dirs: dirResults}
    }

    const globalMemoryContent = this.extractGlobalMemoryContent(ctx) // Normal mode: write combined content

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) continue

      if (project.rootMemoryPrompt != null) { // Write root memory prompt (only if exists)
        const combinedContent = this.combineGlobalWithContent(
          globalMemoryContent,
          project.rootMemoryPrompt.content as string
        )

        const result = await this.writePromptFile(ctx, projectDir, combinedContent, `project:${projectName}/root`)
        fileResults.push(result)
      }

      if (project.childMemoryPrompts != null) { // Write children memory prompts
        for (const child of project.childMemoryPrompts) {
          const childResult = await this.writePromptFile(ctx, child.dir, child.content as string, `project:${projectName}/child:${child.workingChildDirectoryPath?.path ?? 'unknown'}`)
          fileResults.push(childResult)
        }
      }
    }

    const ignoreResults = await this.writeProjectIgnoreFiles(ctx)
    fileResults.push(...ignoreResults)

    return {files: fileResults, dirs: dirResults}
  }
}
