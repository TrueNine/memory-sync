import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'
import {AbstractOutputPlugin} from '@truenine/plugin-output-shared'
import {FilePathKind} from '@truenine/plugin-shared'

const EDITOR_CONFIG_FILE = '.editorconfig'

/**
 * Output plugin for writing .editorconfig files to project directories.
 * Reads EditorConfig files collected by EditorConfigInputPlugin.
 */
export class EditorConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('EditorConfigOutputPlugin')
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {editorConfigFiles} = ctx.collectedInputContext

    if (editorConfigFiles == null || editorConfigFiles.length === 0) return results

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      if (project.isPromptSourceProject === true) continue

      const filePath = this.joinPath(projectDir.path, EDITOR_CONFIG_FILE)
      results.push({
        pathKind: FilePathKind.Relative,
        path: filePath,
        basePath: projectDir.basePath,
        getDirectoryName: () => projectDir.getDirectoryName(),
        getAbsolutePath: () => this.resolvePath(projectDir.basePath, filePath)
      })
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {editorConfigFiles} = ctx.collectedInputContext
    if (editorConfigFiles != null && editorConfigFiles.length > 0) return true

    this.log.debug('skipped', {reason: 'no EditorConfig files found'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {editorConfigFiles} = ctx.collectedInputContext
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
