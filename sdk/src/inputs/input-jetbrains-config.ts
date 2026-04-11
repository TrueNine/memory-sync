import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {IDEKind} from '../adaptors/adaptor-core/enums'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'

export class JetBrainsConfigInputCapability extends AbstractInputCapability {
  constructor() {
    super('JetBrainsConfigInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const aindexDirName = ctx.userConfigOptions.aindex?.dir ?? 'aindex'
    const aindexDir = path.join(ctx.userConfigOptions.workspaceDir, aindexDirName)
    const proxyFilePath = path.join(aindexDir, 'public', 'proxy.ts')

    if (fs.existsSync(proxyFilePath)) {
      const files: NonNullable<ReturnType<typeof readPublicIdeConfigDefinitionFile>>[] = []
      const paths = ['.idea/codeStyles/Project.xml', '.idea/codeStyles/codeStyleConfig.xml', '.idea/.gitignore']
      for (const p of paths) {
        const file = readPublicIdeConfigDefinitionFile(IDEKind.IntellijIDEA, p, aindexDir, fs, {workspaceDir: ctx.userConfigOptions.workspaceDir})
        if (file != null) files.push(file)
      }
      return {jetbrainsConfigFiles: files.length > 0 ? files : void 0} as Partial<InputCollectedContext>
    }

    const native = getNativeBinding<{collectJetBrainsConfig?: (optionsJson: string) => string}>()
    if (native?.collectJetBrainsConfig != null) {
      const result = native.collectJetBrainsConfig(JSON.stringify(ctx.userConfigOptions))
      return JSON.parse(result) as Partial<InputCollectedContext>
    }

    throw new Error('Native collectJetBrainsConfig binding is not available')
  }
}
