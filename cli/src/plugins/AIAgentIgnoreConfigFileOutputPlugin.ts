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
 * Input file name for trae → output path .trae/.ignore
 */
const TRAE_INPUT_FILE = '.traeignore'
const TRAE_OUTPUT_PATH = path.join('.trae', '.ignore')

/**
 * All output paths this plugin manages (for cleanup).
 * Root-level ignore files + .trae/.ignore
 */
const CLEANUP_OUTPUT_PATHS = [
  '.qoderignore',
  '.cursorignore',
  '.kiroignore',
  '.warpindexignore',
  '.aiignore',
  TRAE_OUTPUT_PATH
] as const

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

      for (const outputPath of CLEANUP_OUTPUT_PATHS) { // Register all possible ignore output paths for cleanup
        const filePath = path.join(project.dirFromWorkspacePath.path, outputPath)
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

  private getOutputPath(fileName: string): string {
    return fileName === TRAE_INPUT_FILE ? TRAE_OUTPUT_PATH : fileName
  }

  private async writeIgnoreFile(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    ignoreFile: {fileName: string, content: string},
    label: string
  ): Promise<WriteResult> {
    const outputPath = this.getOutputPath(ignoreFile.fileName)
    const filePath = path.join(projectDir.path, outputPath)
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
      if (outputPath === TRAE_OUTPUT_PATH) {
        const traeDir = path.join(projectDir.basePath, projectDir.path, '.trae')
        fs.mkdirSync(traeDir, {recursive: true})
      }
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
