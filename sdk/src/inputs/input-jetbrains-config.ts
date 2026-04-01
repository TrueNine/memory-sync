import type {InputCapabilityContext, InputCollectedContext, ProjectIDEConfigFile} from '../plugins/plugin-core'
import {AbstractInputCapability, IDEKind} from '../plugins/plugin-core'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'

export class JetBrainsConfigInputCapability extends AbstractInputCapability {
  constructor() {
    super('JetBrainsConfigInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const {userConfigOptions, fs} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(userConfigOptions)

    const files = [
      '.idea/codeStyles/Project.xml',
      '.idea/codeStyles/codeStyleConfig.xml',
      '.idea/.gitignore'
    ]
    const jetbrainsConfigFiles: ProjectIDEConfigFile<IDEKind.IntellijIDEA>[] = []

    for (const relativePath of files) {
      const file = readPublicIdeConfigDefinitionFile(IDEKind.IntellijIDEA, relativePath, aindexDir, fs, {
        command: ctx.runtimeCommand,
        workspaceDir
      })
      if (file != null) jetbrainsConfigFiles.push(file)
    }

    return {jetbrainsConfigFiles}
  }
}
