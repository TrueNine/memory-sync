import type { Logger } from '@/log'
import type { CollectedInputContext, InputPlugin, InputPluginContext, ProjectIDEConfigFile } from '@/types'

import { createLogger } from '@/log'
import {

  FilePathKind,
  IDEKind,

  PluginKind,

} from '@/types'
import { resolveBasePaths } from '@/utils/pathUtils'

export class FileSystemIdeConfigPlugin implements InputPlugin {
  readonly type = PluginKind.Input
  readonly name = 'FileSystemIdeConfigPlugin'
  readonly log: Logger

  constructor() {
    this.log = createLogger(this.name)
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions, fs, path } = ctx
    const { shadowProjectDir } = resolveBasePaths(userConfigOptions)

    const defaultIdeFiles = [
      '.editorconfig',
      '.idea/codeStyles/Project.xml',
      '.idea/codeStyles/codeStyleConfig.xml',
      '.idea/.gitignore',
      '.vscode/settings.json',
      '.vscode/extensions.json',
    ]

    const ideConfigFiles: ProjectIDEConfigFile<IDEKind>[] = []

    for (const relativePath of defaultIdeFiles) {
      const absPath = path.join(shadowProjectDir, relativePath)
      if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
        const content = fs.readFileSync(absPath, 'utf-8')
        let type: IDEKind = IDEKind.Original
        if (relativePath.includes('.vscode')) {
          type = IDEKind.VSCode
        } else if (relativePath.includes('.idea')) {
          type = IDEKind.IntellijIDEA
        } else if (relativePath.includes('.editorconfig')) {
          type = IDEKind.EditorConfig
        }

        ideConfigFiles.push({
          type,
          content,
          length: content.length,
          filePathKind: FilePathKind.Absolute,
          dir: {
            pathKind: FilePathKind.Absolute,
            path: absPath,
            getDirectoryName: () => path.basename(absPath),
          },
        })
      }
    }

    return { ideConfigFiles }
  }
}
