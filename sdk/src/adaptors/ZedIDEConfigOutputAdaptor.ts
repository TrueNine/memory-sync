import type {
  OutputFileDeclaration,
  OutputWriteContext
} from './adaptor-core'
import {AbstractOutputAdaptor, IDEKind} from './adaptor-core'

const ZED_DIR = '.zed'

export class ZedIDEConfigOutputAdaptor extends AbstractOutputAdaptor {
  constructor() {
    super('ZedIDEConfigOutputAdaptor', {
      cleanup: {
        delete: {
          project: {
            files: ['.zed/settings.json']
          }
        }
      },
      capabilities: {}
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const zedConfigs = ctx.collectedOutputContext.zedConfigFiles ?? []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      for (const config of zedConfigs) {
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

    if (config.type !== IDEKind.Zed) return this.basename(sourcePath)

    const zedIndex = sourcePath.indexOf(ZED_DIR)
    if (zedIndex !== -1) return sourcePath.slice(Math.max(0, zedIndex))
    return this.joinPath(ZED_DIR, 'settings.json')
  }
}
