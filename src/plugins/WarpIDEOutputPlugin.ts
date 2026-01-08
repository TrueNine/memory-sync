import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const PROJECT_MEMORY_FILE = 'WARP.md'

/**
 * Warp IDE output plugin for generating WARP.md files.
 *
 * Note: Warp IDE supports AGENTS.md natively, so this plugin handles child memory prompts
 * differently than other plugins:
 *
 * 1. When AgentsOutputPlugin is NOT registered:
 *    - Root memory prompts are written to project root as WARP.md (combined with global memory)
 *    - Child memory prompts are written to subdirectories as WARP.md (without global memory)
 *
 * 2. When AgentsOutputPlugin IS registered:
 *    - AgentsOutputPlugin handles AGENTS.md output (which Warp reads natively)
 *    - This plugin only writes global memory to each project's WARP.md
 *    - Root memory prompts are effectively converted to global memory by AgentsOutputPlugin
 *    - Child memory prompts are handled by AgentsOutputPlugin via AGENTS.md in subdirectories
 *
 * This design leverages Warp's native AGENTS.md support while providing WARP.md as a fallback
 * or supplementary output format.
 */
export class WarpIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('WarpIDEOutputPlugin', {
      outputFileName: PROJECT_MEMORY_FILE,
    })
  }

  /**
   * Check if AgentsOutputPlugin is registered
   */
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
        // When AgentsOutputPlugin is registered, register WARP.md for global prompt output to each project
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath, PROJECT_MEMORY_FILE))
      } else {
        // Normal mode: register files for projects with prompts
        if (project.rootMemoryPrompt != null) results.push(this.createFileRelativePath(project.dirFromWorkspacePath, PROJECT_MEMORY_FILE))

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
      // When AgentsOutputPlugin is registered, only write if we have global memory
      if (globalMemory == null) {
        this.log.debug('skipped', {reason: 'AgentsOutputPlugin registered but no global memory'})
        return false
      }
      return true
    }

    // Normal mode: check for project outputs
    const hasProjectOutputs = workspace.projects.some(
      p => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0,
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
      // When AgentsOutputPlugin is registered, write global prompt to each project's WARP.md
      if (globalMemory == null) return {files: [], dirs: []}

      for (const project of projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue

        const projectName = project.name ?? 'unknown'
        const result = await this.writePromptFile(
          ctx,
          projectDir,
          globalMemory.content as string,
          `project:${projectName}/global-warp`,
        )
        fileResults.push(result)
      }

      return {files: fileResults, dirs: dirResults}
    }

    // Normal mode: write combined content
    // Note: Child memory prompts are written without global memory prefix,
    // as Warp supports AGENTS.md natively for hierarchical prompt inheritance.
    // When users need child-level prompts with global context, they should use
    // AgentsOutputPlugin which outputs AGENTS.md files that Warp reads directly.
    const globalMemoryContent = this.extractGlobalMemoryContent(ctx)

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) continue

      // Write root memory prompt (only if exists)
      if (project.rootMemoryPrompt != null) {
        // Combine global memory with root memory prompt using helper method
        const combinedContent = this.combineGlobalWithContent(
          globalMemoryContent,
          project.rootMemoryPrompt.content as string,
        )

        const result = await this.writePromptFile(
          ctx,
          projectDir,
          combinedContent,
          `project:${projectName}/root`,
        )
        fileResults.push(result)
      }

      // Write children memory prompts
      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const childResult = await this.writePromptFile(
            ctx,
            child.dir,
            child.content as string,
            `project:${projectName}/child:${child.workingChildDirectoryPath?.path ?? 'unknown'}`,
          )
          fileResults.push(childResult)
        }
      }
    }

    return {files: fileResults, dirs: dirResults}
  }
}
