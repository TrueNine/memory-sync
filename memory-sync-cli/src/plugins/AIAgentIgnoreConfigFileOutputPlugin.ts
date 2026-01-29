import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

/**
 * All ignore file names that this plugin manages
 */
const IGNORE_FILE_NAMES = ['.qoderignore', '.cursorignore', '.warpindexignore', '.aiignore'] as const

export class AIAgentIgnoreConfigFileOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('AIAgentIgnoreConfigFileOutputPlugin')
  }

  async registerProjectOutputDirs(): Promise<RelativePath[]> {
    return [] // No directories to clean
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      if (project.isPromptSourceProject === true) continue // that should be protected from cleanup // Skip prompt source projects (e.g., aindex) - their files are source files

      for (const fileName of IGNORE_FILE_NAMES) { // Register all possible ignore files for cleanup
        const filePath = path.join(project.dirFromWorkspacePath.path, fileName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: filePath,
          basePath: project.dirFromWorkspacePath.basePath,
          getDirectoryName: () => path.basename(project.dirFromWorkspacePath!.path),
          getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, filePath)
        })
      }
    }

    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    return [] // No global directories to clean
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    return [] // No global files to clean
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    if (aiAgentIgnoreConfigFiles?.length !== 0) return true

    this.log.debug('skipped', {reason: 'no ignore config files to write'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (aiAgentIgnoreConfigFiles == null || aiAgentIgnoreConfigFiles.length === 0) return {files: fileResults, dirs: dirResults}

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      const projectName = project.name ?? 'unknown'

      for (const ignoreFile of aiAgentIgnoreConfigFiles) {
        const result = await this.writeIgnoreFile(ctx, projectDir, ignoreFile, `project:${projectName}/${ignoreFile.fileName}`)
        fileResults.push(result)
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  private async writeIgnoreFile(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    ignoreFile: {fileName: string, content: string},
    label: string
  ): Promise<WriteResult> {
    const filePath = path.join(projectDir.path, ignoreFile.fileName)
    const fullPath = path.join(projectDir.basePath, filePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: filePath,
      basePath: projectDir.basePath,
      getDirectoryName: () => path.basename(projectDir.path),
      getAbsolutePath: () => fullPath
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'ignoreFile', path: fullPath, label})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      fs.writeFileSync(fullPath, ignoreFile.content, 'utf8')
      this.log.trace({action: 'write', type: 'ignoreFile', path: fullPath, label})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'ignoreFile', path: fullPath, label, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }
}
