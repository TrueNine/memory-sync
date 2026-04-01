import type {InputCapabilityContext, InputCollectedContext, ProjectIDEConfigFile} from '../plugins/plugin-core'
import {AbstractInputCapability, IDEKind} from '../plugins/plugin-core'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'

export class VSCodeConfigInputCapability extends AbstractInputCapability {
  constructor() {
    super('VSCodeConfigInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const {userConfigOptions, fs} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(userConfigOptions)

    const files = ['.vscode/settings.json', '.vscode/extensions.json']
    const vscodeConfigFiles: ProjectIDEConfigFile<IDEKind.VSCode>[] = []

    for (const relativePath of files) {
      const file = readPublicIdeConfigDefinitionFile(IDEKind.VSCode, relativePath, aindexDir, fs, {
        command: ctx.runtimeCommand,
        workspaceDir
      })
      if (file != null) vscodeConfigFiles.push(file)
    }

    return {vscodeConfigFiles}
  }
}
