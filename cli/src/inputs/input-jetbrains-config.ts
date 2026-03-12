import type {InputCollectedContext} from '../plugins/plugin-core'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'
import {AbstractInputPlugin, IDEKind, type InputPluginContext, type ProjectIDEConfigFile} from '../plugins/plugin-core'

export class JetBrainsConfigInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('JetBrainsConfigInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<InputCollectedContext> {
    const {userConfigOptions, fs} = ctx
    const {aindexDir} = this.resolveBasePaths(userConfigOptions)

    const files = [
      '.idea/codeStyles/Project.xml',
      '.idea/codeStyles/codeStyleConfig.xml',
      '.idea/.gitignore'
    ]
    const jetbrainsConfigFiles: ProjectIDEConfigFile<IDEKind.IntellijIDEA>[] = []

    for (const relativePath of files) {
      const file = readPublicIdeConfigDefinitionFile(IDEKind.IntellijIDEA, relativePath, aindexDir, fs)
      if (file != null) jetbrainsConfigFiles.push(file)
    }

    return {jetbrainsConfigFiles}
  }
}
