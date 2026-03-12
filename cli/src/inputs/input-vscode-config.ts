import type {InputCollectedContext} from '../plugins/plugin-core'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'
import {AbstractInputPlugin, IDEKind, type InputPluginContext, type ProjectIDEConfigFile} from '../plugins/plugin-core'

export class VSCodeConfigInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('VSCodeConfigInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<InputCollectedContext> {
    const {userConfigOptions, fs} = ctx
    const {aindexDir} = this.resolveBasePaths(userConfigOptions)

    const files = ['.vscode/settings.json', '.vscode/extensions.json']
    const vscodeConfigFiles: ProjectIDEConfigFile<IDEKind.VSCode>[] = []

    for (const relativePath of files) {
      const file = readPublicIdeConfigDefinitionFile(IDEKind.VSCode, relativePath, aindexDir, fs)
      if (file != null) vscodeConfigFiles.push(file)
    }

    return {vscodeConfigFiles}
  }
}
