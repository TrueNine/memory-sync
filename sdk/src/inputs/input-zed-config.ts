import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {IDEKind} from '../adaptors/adaptor-core/enums'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'

export class ZedConfigInputCapability extends AbstractInputCapability {
  constructor() {
    super('ZedConfigInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const aindexDirName = ctx.userConfigOptions.aindex?.dir ?? 'aindex'
    const aindexDir = path.join(ctx.userConfigOptions.workspaceDir, aindexDirName)
    const proxyFilePath = path.join(aindexDir, 'public', 'proxy.ts')

    if (fs.existsSync(proxyFilePath)) {
      const file = readPublicIdeConfigDefinitionFile(IDEKind.Zed, '.zed/settings.json', aindexDir, fs, {workspaceDir: ctx.userConfigOptions.workspaceDir})
      return {zedConfigFiles: file != null ? [file] : void 0} as Partial<InputCollectedContext>
    }

    const native = getNativeBinding<{collectZedConfig?: (optionsJson: string) => string}>()
    if (native?.collectZedConfig != null) {
      const result = native.collectZedConfig(JSON.stringify(ctx.userConfigOptions))
      return JSON.parse(result) as Partial<InputCollectedContext>
    }

    throw new Error('Native collectZedConfig binding is not available')
  }
}
