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

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      // Root memory prompt uses project.dirFromWorkspacePath
      if (project.rootMemoryPrompt != null && project.dirFromWorkspacePath != null) {
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

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { workspace } = ctx.collectedInputContext
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
    const { workspace } = ctx.collectedInputContext
    const { projects } = workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    // Extract global memory content using helper method
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
