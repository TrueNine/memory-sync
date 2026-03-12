import type {InputCollectedContext} from '../plugins/plugin-core'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'
import {AbstractInputPlugin, IDEKind, type InputPluginContext, type ProjectIDEConfigFile} from '../plugins/plugin-core'

export class EditorConfigInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('EditorConfigInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<InputCollectedContext> {
    const {userConfigOptions, fs} = ctx
    const {aindexDir} = this.resolveBasePaths(userConfigOptions)

    const editorConfigFiles: ProjectIDEConfigFile<IDEKind.EditorConfig>[] = []
    const file = readPublicIdeConfigDefinitionFile(IDEKind.EditorConfig, '.editorconfig', aindexDir, fs)
    if (file != null) editorConfigFiles.push(file)

    return {editorConfigFiles}
  }
}
