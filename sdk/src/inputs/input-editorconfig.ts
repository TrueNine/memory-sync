import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {IDEKind} from '../adaptors/adaptor-core/enums'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'
import {parseNativeInputResult} from './native-result'

export class EditorConfigInputCapability extends AbstractInputCapability {
  constructor() {
    super('EditorConfigInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const aindexDirName = ctx.userConfigOptions.aindex?.dir ?? 'aindex'
    const aindexDir = path.join(ctx.userConfigOptions.workspaceDir, aindexDirName)
    const proxyFilePath = path.join(aindexDir, 'public', 'proxy.ts')

    if (fs.existsSync(proxyFilePath)) {
      const file = readPublicIdeConfigDefinitionFile(IDEKind.EditorConfig, '.editorconfig', aindexDir, fs, {
        workspaceDir: ctx.userConfigOptions.workspaceDir,
        command: ctx.runtimeCommand
      })
      return {editorConfigFiles: file != null ? [file] : void 0} as Partial<InputCollectedContext>
    }

    const native = getNativeBinding<{collectEditorconfig?: (optionsJson: string) => string}>()
    if (native?.collectEditorconfig != null) {
      const result = native.collectEditorconfig(JSON.stringify(ctx.userConfigOptions))
      return parseNativeInputResult<Partial<InputCollectedContext>>(result)
    }

    throw new Error('Native collectEditorconfig binding is not available')
  }
}
