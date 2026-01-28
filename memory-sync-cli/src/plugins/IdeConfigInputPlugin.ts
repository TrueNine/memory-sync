import type {CollectedInputContext, InputPluginContext, ProjectIDEConfigFile} from 'memory-sync-cli/src/types'

import {
  FilePathKind,
  IDEKind
} from 'memory-sync-cli/src/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

export class IdeConfigInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('IdeConfigInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions, fs, path} = ctx
    const {shadowProjectDir} = this.resolveBasePaths(userConfigOptions)

    const defaultIdeFiles = [
      '.editorconfig',
      '.idea/codeStyles/Project.xml',
      '.idea/codeStyles/codeStyleConfig.xml',
      '.idea/.gitignore',
      '.vscode/settings.json',
      '.vscode/extensions.json'
    ]

    const ideConfigFiles: ProjectIDEConfigFile<IDEKind>[] = []

    for (const relativePath of defaultIdeFiles) {
      const absPath = path.join(shadowProjectDir, relativePath)
      if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
        const content = fs.readFileSync(absPath, 'utf8')
        let type: IDEKind = IDEKind.Original
        if (relativePath.includes('.vscode')) type = IDEKind.VSCode
        else if (relativePath.includes('.idea')) type = IDEKind.IntellijIDEA
        else if (relativePath.includes('.editorconfig')) type = IDEKind.EditorConfig

        ideConfigFiles.push({
          type,
          content,
          length: content.length,
          filePathKind: FilePathKind.Absolute,
          dir: {
            pathKind: FilePathKind.Absolute,
            path: absPath,
            getDirectoryName: () => path.basename(absPath)
          }
        })
      }
    }

    return {ideConfigFiles}
  }
}
