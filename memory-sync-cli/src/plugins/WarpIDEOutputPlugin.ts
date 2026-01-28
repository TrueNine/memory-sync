import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from 'memory-sync-cli/src/types'
import type {RelativePath} from 'memory-sync-cli/src/types/FileSystemTypes'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const PROJECT_MEMORY_FILE = 'WARP.md'

export class WarpIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('WarpIDEOutputPlugin', {outputFileName: PROJECT_MEMORY_FILE})
  }

  private isAgentsPluginRegistered(ctx: OutputPluginContext | OutputWriteContext): boolean {
    if ('registeredPluginNames' in ctx && ctx.registeredPluginNames != null) return ctx.registeredPluginNames.includes('AgentsOutputPlugin')
    return false
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const agentsRegistered = this.isAgentsPluginRegistered(ctx)

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      if (agentsRegistered) {
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath, PROJECT_MEMORY_FILE)) // When AgentsOutputPlugin is registered, register WARP.md for global prompt output to each project
      } else {
        if (project.rootMemoryPrompt != null) results.push(this.createFileRelativePath(project.dirFromWorkspacePath, PROJECT_MEMORY_FILE)) // Normal mode: register files for projects with prompts

        if (project.childMemoryPrompts != null) {
          for (const child of project.childMemoryPrompts) {
            if (child.dir != null && this.isRelativePath(child.dir)) results.push(this.createFileRelativePath(child.dir, PROJECT_MEMORY_FILE))
          }
        }
      }
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const agentsRegistered = this.isAgentsPluginRegistered(ctx)
    const {workspace, globalMemory} = ctx.collectedInputContext

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

    if (hasProjectOutputs) return true

    this.log.debug('skipped', {reason: 'no outputs to write'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const agentsRegistered = this.isAgentsPluginRegistered(ctx)
    const {workspace, globalMemory} = ctx.collectedInputContext
    const {projects} = workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (agentsRegistered) {
      if (globalMemory == null) return {files: [], dirs: []} // When AgentsOutputPlugin is registered, write global prompt to each project's WARP.md

      for (const project of projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue

        const projectName = project.name ?? 'unknown'
        const result = await this.writePromptFile(ctx, projectDir, globalMemory.content as string, `project:${projectName}/global-warp`)
        fileResults.push(result)
      }

      return {files: fileResults, dirs: dirResults}
    }

    const globalMemoryContent = this.extractGlobalMemoryContent(ctx) // AgentsOutputPlugin which outputs AGENTS.md files that Warp reads directly. // When users need child-level prompts with global context, they should use // as Warp supports AGENTS.md natively for hierarchical prompt inheritance. // Note: Child memory prompts are written without global memory prefix, // Normal mode: write combined content

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) continue

      if (project.rootMemoryPrompt != null) { // Write root memory prompt (only if exists)
        const combinedContent = this.combineGlobalWithContent( // Combine global memory with root memory prompt using helper method
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

    return {files: fileResults, dirs: dirResults}
  }
}
