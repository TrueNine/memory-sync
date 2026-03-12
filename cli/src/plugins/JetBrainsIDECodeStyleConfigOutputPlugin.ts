import type {
  OutputFileDeclaration,
  OutputWriteContext
} from './plugin-core'
import {AbstractOutputPlugin, IDEKind} from './plugin-core'

const IDEA_DIR = '.idea'
const CODE_STYLES_DIR = 'codeStyles'

export class JetBrainsIDECodeStyleConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('JetBrainsIDECodeStyleConfigOutputPlugin', {
      cleanup: {
        delete: {
          project: {
            files: ['.editorconfig', '.idea/codeStyles/Project.xml', '.idea/codeStyles/codeStyleConfig.xml', '.idea/.gitignore']
          }
        }
      },
      capabilities: {}
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const {jetbrainsConfigFiles, editorConfigFiles} = ctx.collectedOutputContext
    const jetbrainsConfigs = [...jetbrainsConfigFiles ?? [], ...editorConfigFiles ?? []]

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null || project.isPromptSourceProject === true) continue

      for (const config of jetbrainsConfigs) {
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
    _ctx: OutputWriteContext
  ): Promise<string> {
    const source = declaration.source as {content?: string}
    if (source.content == null) throw new Error(`Unsupported declaration source for ${this.name}`)
    return source.content
  }

  private getTargetRelativePath(config: {type: IDEKind, dir: {path: string}}): string {
    const sourcePath = config.dir.path

    if (config.type === IDEKind.EditorConfig) return '.editorconfig'

    if (config.type !== IDEKind.IntellijIDEA) return this.basename(sourcePath)

    const ideaIndex = sourcePath.indexOf(IDEA_DIR)
    if (ideaIndex !== -1) return sourcePath.slice(Math.max(0, ideaIndex))
    return this.joinPath(IDEA_DIR, CODE_STYLES_DIR, this.basename(sourcePath))
  }
}
