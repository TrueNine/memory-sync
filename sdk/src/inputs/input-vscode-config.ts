import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {IDEKind} from '../adaptors/adaptor-core/enums'
import {readPublicIdeConfigDefinitionFile} from '../public-config-paths'
import {parseNativeInputResult} from './native-result'

export class VSCodeConfigInputCapability extends AbstractInputCapability {
  constructor() {
    super('VSCodeConfigInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const aindexDirName = ctx.userConfigOptions.aindex?.dir ?? 'aindex'
    const aindexDir = path.join(ctx.userConfigOptions.workspaceDir, aindexDirName)
    const proxyFilePath = path.join(aindexDir, 'public', 'proxy.ts')

    if (fs.existsSync(proxyFilePath)) {
      const files: NonNullable<ReturnType<typeof readPublicIdeConfigDefinitionFile>>[] = []
      const paths = ['.vscode/settings.json', '.vscode/extensions.json']
      for (const p of paths) {
        const file = readPublicIdeConfigDefinitionFile(IDEKind.VSCode, p, aindexDir, fs, {
          workspaceDir: ctx.userConfigOptions.workspaceDir,
          command: ctx.runtimeCommand
        })
        if (file != null) files.push(file)
      }
      return {vscodeConfigFiles: files.length > 0 ? files : void 0} as Partial<InputCollectedContext>
    }

    const native = getNativeBinding<{collectVSCodeConfig?: (optionsJson: string) => string}>()
    if (native?.collectVSCodeConfig != null) {
      const result = native.collectVSCodeConfig(JSON.stringify(ctx.userConfigOptions))
      return parseNativeInputResult<Partial<InputCollectedContext>>(result)
    }

    throw new Error('Native collectVSCodeConfig binding is not available')
  }
}
