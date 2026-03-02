import type {CollectedInputContext, InputPluginContext, ProjectIDEConfigFile} from '@truenine/plugin-shared'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {FilePathKind, IDEKind} from '@truenine/plugin-shared'

function readIdeConfigFile<T extends IDEKind>(
  type: T,
  relativePath: string,
  shadowProjectDir: string,
  fs: typeof import('node:fs'),
  path: typeof import('node:path')
): ProjectIDEConfigFile<T> | undefined {
  const absPath = path.join(shadowProjectDir, relativePath)
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

export class VSCodeConfigInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('VSCodeConfigInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions, fs, path} = ctx
    const {shadowProjectDir} = this.resolveBasePaths(userConfigOptions)

    const files = ['.vscode/settings.json', '.vscode/extensions.json']
    const vscodeConfigFiles: ProjectIDEConfigFile<IDEKind.VSCode>[] = []

    for (const relativePath of files) {
      const file = readIdeConfigFile(IDEKind.VSCode, relativePath, shadowProjectDir, fs, path)
      if (file != null) vscodeConfigFiles.push(file)
    }

    return {vscodeConfigFiles}
  }
}
