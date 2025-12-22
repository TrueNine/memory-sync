import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

const PROJECT_MEMORY_FILE = 'WARP.md'

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
    if ('registeredPluginNames' in ctx && ctx.registeredPluginNames != null) {
      return ctx.registeredPluginNames.includes('AgentsOutputPlugin')
    }
    return false
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace
    const agentsRegistered = this.isAgentsPluginRegistered(ctx)

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      if (agentsRegistered) {
        // When AgentsOutputPlugin is registered, register WARP.md for global prompt output to each project
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath, PROJECT_MEMORY_FILE))
      } else {
        // Normal mode: register files for projects with prompts
        if (project.rootMemoryPrompt != null) {
          results.push(this.createFileRelativePath(project.dirFromWorkspacePath, PROJECT_MEMORY_FILE))
        }

        if (project.childMemoryPrompts != null) {
          for (const child of project.childMemoryPrompts) {
            if (child.dir != null && this.isRelativePath(child.dir)) {
              results.push(this.createFileRelativePath(child.dir, PROJECT_MEMORY_FILE))
            }
          }
        }
      }
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const agentsRegistered = this.isAgentsPluginRegistered(ctx)
    const { workspace, globalMemory } = ctx.collectedInputContext

    if (agentsRegistered) {
      // When AgentsOutputPlugin is registered, only write if we have global memory
      if (globalMemory == null) {
        this.log.info('AgentsOutputPlugin registered but no global memory, skipping global WARP.md')
        return false
      }
      return true
    }

    // Normal mode: check for project outputs
    const hasProjectOutputs = workspace.projects.some(
      (p) => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0,
    )

    if (!hasProjectOutputs) {
      this.log.info('No outputs to write, skipping')
      return false
    }

    return true
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const agentsRegistered = this.isAgentsPluginRegistered(ctx)
    const { workspace, globalMemory } = ctx.collectedInputContext
    const { projects } = workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (agentsRegistered) {
      // When AgentsOutputPlugin is registered, write global prompt to each project's WARP.md
      if (globalMemory == null) {
        return { files: [], dirs: [] }
      }

      for (const project of projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) {
          continue
        }

        const projectName = project.name ?? 'unknown'
        const result = await this.writePromptFile(
          ctx,
          projectDir,
          globalMemory.content as string,
          `project:${projectName}/global-warp`,
        )
        fileResults.push(result)
      }

      return { files: fileResults, dirs: dirResults }
    }

    // Normal mode: write combined content
    const globalMemoryContent = this.extractGlobalMemoryContent(ctx)

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) {
        continue
      }

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

    return { files: fileResults, dirs: dirResults }
  }
}
