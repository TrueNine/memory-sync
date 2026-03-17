import type {InputCapabilityContext, InputCollectedContext, ProjectIDEConfigFile} from '../plugins/plugin-core'
import {AbstractInputCapability, IDEKind} from '../plugins/plugin-core'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'

export class EditorConfigInputCapability extends AbstractInputCapability {
  constructor() {
    super('EditorConfigInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const {userConfigOptions, fs} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(userConfigOptions)

    const editorConfigFiles: ProjectIDEConfigFile<IDEKind.EditorConfig>[] = []
    const file = readPublicIdeConfigDefinitionFile(IDEKind.EditorConfig, '.editorconfig', aindexDir, fs, {
      command: ctx.runtimeCommand,
      workspaceDir
    })
    if (file != null) editorConfigFiles.push(file)

    return {editorConfigFiles}
  }
}
