import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-core'
import {AbstractOutputPlugin} from '../plugin-core'

const EDITOR_CONFIG_FILE = '.editorconfig'

/**
 * Output plugin for writing .editorconfig files to project directories.
 * Reads EditorConfig files collected by EditorConfigInputPlugin.
 */
export class EditorConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('EditorConfigOutputPlugin')
  }

  override async registerGlobalOutputFiles(): Promise<string[]> {
    return [] // No global files to output
  }

  override async writeGlobalOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // No global outputs to write
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const {editorConfigFiles} = ctx.collectedOutputContext

    if (editorConfigFiles == null || editorConfigFiles.length === 0) return results

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      if (project.isPromptSourceProject === true) continue

      results.push(this.joinPath(projectDir.path, EDITOR_CONFIG_FILE))
    }

    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {editorConfigFiles} = ctx.collectedOutputContext
    if (editorConfigFiles != null && editorConfigFiles.length > 0) return true

    this.log.debug('skipped', {reason: 'no EditorConfig files found'})
    return false
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedOutputContext.workspace
    const {editorConfigFiles} = ctx.collectedOutputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (editorConfigFiles == null || editorConfigFiles.length === 0) return {files: fileResults, dirs: dirResults}

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      if (project.isPromptSourceProject === true) continue

      const projectName = project.name ?? 'unknown'

      for (const config of editorConfigFiles) {
        const fullPath = this.resolvePath(projectDir.basePath, projectDir.path, EDITOR_CONFIG_FILE)
        const result = await this.writeFile(ctx, fullPath, config.content, `project:${projectName}/.editorconfig`)
        fileResults.push(result)
      }
    }

    return {files: fileResults, dirs: dirResults}
  }
}
