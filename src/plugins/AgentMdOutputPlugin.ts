import type { Logger } from '@/log'
import type {
  OutputPlugin,
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type { Path, RelativePath } from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { createLogger } from '@/log'
import { FilePathKind, PluginKind } from '@/types'

export class AgentMdOutputPlugin implements OutputPlugin {
  readonly type = PluginKind.Output
  readonly name = 'AgentMdOutputPlugin'
  readonly log: Logger

  constructor() {
    this.log = createLogger(this.name)
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      const rootDir = project.rootMemoryPrompt?.dir
      if (rootDir != null && this.isRelativePath(rootDir)) {
        results.push(rootDir)
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          if (child.dir != null && this.isRelativePath(child.dir)) {
            results.push(child.dir)
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
    const { projects } = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'

      // Write root memory prompt
      if (project.rootMemoryPrompt != null) {
        const rootDir = project.rootMemoryPrompt.dir
        const result = await this.writePromptFile(
          ctx,
          rootDir,
          project.rootMemoryPrompt.content as string,
          `project:${projectName}/root`,
        )
        fileResults.push(result)
      }

      // Write children memory prompts
      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const result = await this.writePromptFile(
            ctx,
            child.dir,
            child.content as string,
            `project:${projectName}/child:${child.workingChildDirectoryPath?.path ?? 'unknown'}`,
          )
          fileResults.push(result)
        }
      }
    }

    return { files: fileResults, dirs: dirResults }
  }

  async onWriteComplete(ctx: OutputWriteContext, results: WriteResults): Promise<void> {
    const successCount = results.files.filter((r) => r.success).length
    const skipCount = results.files.filter((r) => r.skipped).length
    const failCount = results.files.filter((r) => !(Boolean(r.success)) && !(Boolean(r.skipped))).length

    const mode = ctx.dryRun === true ? '[DRY-RUN]' : ''
    this.log.info(`${mode} Write complete: ${successCount} success, ${skipCount} skipped, ${failCount} failed`)
  }

  private async writePromptFile(
    ctx: OutputWriteContext,
    targetPath: Path,
    content: string,
    label: string,
  ): Promise<WriteResult> {
    const fullPath = this.resolveFullPath(targetPath)
    const relativePath = this.toRelativePath(targetPath)

    if (ctx.dryRun === true) {
      this.log.info(`[DRY-RUN] Would write ${label} -> ${fullPath}`)
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(fullPath, content, 'utf-8')
      this.log.info(`Written ${label} -> ${fullPath}`)
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write ${label}: ${errMsg}`)
      return { path: relativePath, success: false, error: error as Error }
    }
  }

  private isRelativePath(p: Path): p is RelativePath {
    return p.pathKind === FilePathKind.Relative
  }

  private toRelativePath(p: Path): RelativePath {
    if (this.isRelativePath(p)) {
      return p
    }
    // Fallback for non-relative paths
    return {
      pathKind: FilePathKind.Relative,
      path: p.path,
      basePath: '',
      getDirectoryName: p.getDirectoryName,
      getAbsolutePath: () => p.path,
    }
  }

  private resolveFullPath(targetPath: Path): string {
    if (targetPath.pathKind === FilePathKind.Absolute) {
      return targetPath.path
    }
    if (this.isRelativePath(targetPath)) {
      return path.resolve(targetPath.basePath, targetPath.path)
    }
    // Empty path - use current working directory
    return path.resolve(process.cwd(), targetPath.path)
  }
}
