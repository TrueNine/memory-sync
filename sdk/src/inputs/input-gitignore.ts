import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {resolvePublicDefinitionPath} from '../public-config-paths'
import {parseNativeInputResult} from './native-result'

export class GitIgnoreInputCapability extends AbstractInputCapability {
  constructor() {
    super('GitIgnoreInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const aindexDirName = ctx.userConfigOptions.aindex?.dir ?? 'aindex'
    const aindexDir = path.join(ctx.userConfigOptions.workspaceDir, aindexDirName)
    const proxyFilePath = path.join(aindexDir, 'public', 'proxy.ts')

    if (fs.existsSync(proxyFilePath)) {
      const resolvedPath = resolvePublicDefinitionPath(aindexDir, '.gitignore', {
        workspaceDir: ctx.userConfigOptions.workspaceDir,
        command: ctx.runtimeCommand
      })
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf8')
        return {globalGitIgnore: content || void 0} as Partial<InputCollectedContext>
      }
      return {} as Partial<InputCollectedContext>
    }

    const native = getNativeBinding<{collectGitignore?: (optionsJson: string) => string}>()
    if (native?.collectGitignore != null) {
      const result = native.collectGitignore(JSON.stringify(ctx.userConfigOptions))
      return parseNativeInputResult<Partial<InputCollectedContext>>(result)
    }

    throw new Error('Native collectGitignore binding is not available')
  }
}
