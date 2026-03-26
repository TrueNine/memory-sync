import type {InputCapabilityContext, InputCollectedContext, ProjectIDEConfigFile} from '../plugins/plugin-core'
import {AbstractInputCapability, IDEKind} from '../plugins/plugin-core'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'

export class ZedConfigInputCapability extends AbstractInputCapability {
  constructor() {
    super('ZedConfigInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const {userConfigOptions, fs} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(userConfigOptions)

    const zedConfigFiles: ProjectIDEConfigFile<IDEKind.Zed>[] = []
    const file = readPublicIdeConfigDefinitionFile(IDEKind.Zed, '.zed/settings.json', aindexDir, fs, {
      command: ctx.runtimeCommand,
      workspaceDir
    })
    if (file != null) zedConfigFiles.push(file)

    return {zedConfigFiles}
  }
}
