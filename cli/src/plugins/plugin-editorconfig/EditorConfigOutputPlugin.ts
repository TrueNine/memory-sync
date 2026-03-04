import type {
  OutputFileDeclaration,
  OutputWriteContext
} from '../plugin-core'
import {AbstractOutputPlugin} from '../plugin-core'

const EDITOR_CONFIG_FILE = '.editorconfig'

/**
 * Output plugin for writing .editorconfig files to project directories.
 * Reads EditorConfig files collected by EditorConfigInputPlugin.
 */
export class EditorConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('EditorConfigOutputPlugin', {capabilities: {}})
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const {editorConfigFiles} = ctx.collectedOutputContext

    if (editorConfigFiles == null || editorConfigFiles.length === 0) return declarations

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null || project.isPromptSourceProject === true) continue

      for (const config of editorConfigFiles) {
        declarations.push({
          path: this.resolvePath(projectDir.basePath, projectDir.path, EDITOR_CONFIG_FILE),
          scope: 'project',
          source: {content: config.content}
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    _ctx: OutputWriteContext
  ): Promise<string> {
    const source = declaration.source as {content?: string}
    if (source.content == null) throw new Error(`Unsupported declaration source for ${this.name}`)
    return source.content
  }
}
