import type {CollectedInputContext, InputPluginContext, ProjectIDEConfigFile} from '../plugins/plugin-core'
import {AbstractInputPlugin} from '../plugins/plugin-core'
import {FilePathKind, IDEKind} from '../plugins/plugin-core'

function readIdeConfigFile<T extends IDEKind>(
  type: T,
  relativePath: string,
  aindexDir: string,
  fs: typeof import('node:fs'),
  path: typeof import('node:path')
): ProjectIDEConfigFile<T> | undefined {
  const absPath = path.join(aindexDir, relativePath)
  if (!(fs.existsSync(absPath) && fs.statSync(absPath).isFile())) return void 0

  const content = fs.readFileSync(absPath, 'utf8')
  return {
    type,
    content,
    length: content.length,
    filePathKind: FilePathKind.Absolute,
    dir: {
      pathKind: FilePathKind.Absolute,
      path: absPath,
      getDirectoryName: () => path.basename(absPath)
    }
  }
}

export class EditorConfigInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('EditorConfigInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions, fs, path} = ctx
    const {aindexDir} = this.resolveBasePaths(userConfigOptions)

    const editorConfigFiles: ProjectIDEConfigFile<IDEKind.EditorConfig>[] = []
    const file = readIdeConfigFile(IDEKind.EditorConfig, '.editorconfig', aindexDir, fs, path)
    if (file != null) editorConfigFiles.push(file)

    return {editorConfigFiles}
  }
}
