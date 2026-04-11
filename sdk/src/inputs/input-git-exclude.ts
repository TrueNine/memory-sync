import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {resolvePublicDefinitionPath} from '../public-config-paths'

export class GitExcludeInputCapability extends AbstractInputCapability {
  constructor() {
    super('GitExcludeInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const aindexDirName = ctx.userConfigOptions.aindex?.dir ?? 'aindex'
    const aindexDir = path.join(ctx.userConfigOptions.workspaceDir, aindexDirName)
    const proxyFilePath = path.join(aindexDir, 'public', 'proxy.ts')

    if (fs.existsSync(proxyFilePath)) {
      const resolvedPath = resolvePublicDefinitionPath(aindexDir, '.git/info/exclude', {workspaceDir: ctx.userConfigOptions.workspaceDir})
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf8')
        return {shadowGitExclude: content || void 0} as Partial<InputCollectedContext>
      }
      return {} as Partial<InputCollectedContext>
    }

    const native = getNativeBinding<{collectGitExclude?: (optionsJson: string) => string}>()
    if (native?.collectGitExclude != null) {
      const result = native.collectGitExclude(JSON.stringify(ctx.userConfigOptions))
      return JSON.parse(result) as Partial<InputCollectedContext>
    }

    throw new Error('Native collectGitExclude binding is not available')
  }
}
