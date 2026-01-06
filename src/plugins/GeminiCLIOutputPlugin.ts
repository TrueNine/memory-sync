import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { FilePathKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

const PROJECT_MEMORY_FILE = 'GEMINI.md'
const GLOBAL_CONFIG_DIR = '.gemini'

export class GeminiCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GeminiCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
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
          if (child.dir != null && this.isRelativePath(child.dir)) results.push(this.createFileRelativePath(child.dir, PROJECT_MEMORY_FILE))
        }
      }
    }

    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const { globalMemory } = ctx.collectedInputContext
    if (globalMemory == null) return []

    const globalDir = this.getGlobalConfigDir()
    return [
      {
        pathKind: FilePathKind.Relative,
        path: PROJECT_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => GLOBAL_CONFIG_DIR,
        getAbsolutePath: () => path.join(globalDir, PROJECT_MEMORY_FILE),
      },
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { workspace, globalMemory } = ctx.collectedInputContext
    const hasProjectOutputs = workspace.projects.some(
      p => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0,
    )
    const hasGlobalMemory = globalMemory != null

    if (hasProjectOutputs || hasGlobalMemory) return true

    this.log.trace({ action: 'skip', reason: 'noOutputs' })
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { projects } = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) continue

      // Write root memory prompt (only if exists)
      if (project.rootMemoryPrompt != null) {
        const result = await this.writePromptFile(
          ctx,
          projectDir,
          project.rootMemoryPrompt.content as string,
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

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { globalMemory } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory == null) return { files: fileResults, dirs: dirResults }

    const globalDir = this.getGlobalConfigDir()
    const fullPath = path.join(globalDir, PROJECT_MEMORY_FILE)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: PROJECT_MEMORY_FILE,
      basePath: globalDir,
      getDirectoryName: () => GLOBAL_CONFIG_DIR,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'globalMemory', path: fullPath })
      return {
        files: [{ path: relativePath, success: true, skipped: false }],
        dirs: dirResults,
      }
    }

    try {
      this.ensureDirectory(globalDir)
      fs.writeFileSync(fullPath, globalMemory.content as string, 'utf-8')
      this.log.trace({ action: 'write', type: 'globalMemory', path: fullPath })
      fileResults.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'globalMemory', path: fullPath, error: errMsg })
      fileResults.push({ path: relativePath, success: false, error: error as Error })
    }

    return { files: fileResults, dirs: dirResults }
  }
}
