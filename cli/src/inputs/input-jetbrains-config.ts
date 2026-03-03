import type {CollectedInputContext, InputPluginContext, ProjectIDEConfigFile} from '../plugins/plugin-shared'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {FilePathKind, IDEKind} from '../plugins/plugin-shared'

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

export class JetBrainsConfigInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('JetBrainsConfigInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions, fs, path} = ctx
    const {aindexDir} = this.resolveBasePaths(userConfigOptions)

    const files = [
      '.idea/codeStyles/Project.xml',
      '.idea/codeStyles/codeStyleConfig.xml',
      '.idea/.gitignore'
    ]
    const jetbrainsConfigFiles: ProjectIDEConfigFile<IDEKind.IntellijIDEA>[] = []

    for (const relativePath of files) {
      const file = readIdeConfigFile(IDEKind.IntellijIDEA, relativePath, aindexDir, fs, path)
      if (file != null) jetbrainsConfigFiles.push(file)
    }

    return {jetbrainsConfigFiles}
  }
}
