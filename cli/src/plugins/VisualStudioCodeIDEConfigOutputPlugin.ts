import type {
  OutputFileDeclaration,
  OutputWriteContext
} from './plugin-core'
import {AbstractOutputPlugin, IDEKind} from './plugin-core'

const VSCODE_DIR = '.vscode'

export class VisualStudioCodeIDEConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('VisualStudioCodeIDEConfigOutputPlugin', {
      cleanup: {
        delete: {
          project: {
            files: ['.vscode/settings.json', '.vscode/extensions.json']
          }
        }
      },
      capabilities: {}
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const {vscodeConfigFiles} = ctx.collectedOutputContext
    const vscodeConfigs = vscodeConfigFiles ?? []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      for (const config of vscodeConfigs) {
        const targetRelativePath = this.getTargetRelativePath(config)
        declarations.push({
          path: this.resolvePath(projectDir.basePath, projectDir.path, targetRelativePath),
          scope: 'project',
          source: {content: config.content}
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string> {
    void ctx
    const source = declaration.source as {content?: string}
    if (source.content == null) throw new Error(`Unsupported declaration source for ${this.name}`)
    return source.content
  }

  private getTargetRelativePath(config: {type: IDEKind, dir: {path: string}}): string {
    const sourcePath = config.dir.path

    if (config.type !== IDEKind.VSCode) return this.basename(sourcePath)

    const vscodeIndex = sourcePath.indexOf(VSCODE_DIR)
    if (vscodeIndex !== -1) return sourcePath.slice(Math.max(0, vscodeIndex))
    return this.joinPath(VSCODE_DIR, this.basename(sourcePath))
  }
}
