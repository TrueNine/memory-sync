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

export class AIAgentIgnoreConfigFileOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('AIAgentIgnoreConfigFileOutputPlugin')
  }

  async registerProjectOutputDirs(): Promise<RelativePath[]> {
    // No directories to clean
    return []
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace
    const { aiAgentIgnoreConfigFiles } = ctx.collectedInputContext

    if (aiAgentIgnoreConfigFiles == null || aiAgentIgnoreConfigFiles.length === 0) {
      return []
    }

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      for (const ignoreFile of aiAgentIgnoreConfigFiles) {
        const filePath = path.join(project.dirFromWorkspacePath.path, ignoreFile.fileName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: filePath,
          basePath: project.dirFromWorkspacePath.basePath,
          getDirectoryName: () => path.basename(project.dirFromWorkspacePath!.path),
          getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, filePath),
        })
      }
    }

    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    // No global directories to clean
    return []
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    // No global files to clean
    return []
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { aiAgentIgnoreConfigFiles } = ctx.collectedInputContext
    if (aiAgentIgnoreConfigFiles == null || aiAgentIgnoreConfigFiles.length === 0) {
      this.log.info('No ignore config files to write, skipping')
      return false
    }

    return true
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { projects } = ctx.collectedInputContext.workspace
    const { aiAgentIgnoreConfigFiles } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (aiAgentIgnoreConfigFiles == null || aiAgentIgnoreConfigFiles.length === 0) {
      return { files: fileResults, dirs: dirResults }
    }

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) {
        continue
      }

      const projectName = project.name ?? 'unknown'

      for (const ignoreFile of aiAgentIgnoreConfigFiles) {
        const result = await this.writeIgnoreFile(
          ctx,
          projectDir,
          ignoreFile,
          `project:${projectName}/${ignoreFile.fileName}`,
        )
        fileResults.push(result)
      }
    }

    return { files: fileResults, dirs: dirResults }
  }

  private async writeIgnoreFile(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    ignoreFile: { fileName: string, content: string },
    label: string,
  ): Promise<WriteResult> {
    const filePath = path.join(projectDir.path, ignoreFile.fileName)
    const fullPath = path.join(projectDir.basePath, filePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: filePath,
      basePath: projectDir.basePath,
      getDirectoryName: () => path.basename(projectDir.path),
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.info(`[DRY-RUN] Would write ignore config file -> ${fullPath}`)
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      fs.writeFileSync(fullPath, ignoreFile.content, 'utf-8')
      this.log.info(`Written ignore config file -> ${fullPath}`)
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write ignore config file ${label}: ${errMsg}`)
      return { path: relativePath, success: false, error: error as Error }
    }
  }
}
