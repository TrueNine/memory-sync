import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {
  AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS,
  resolvePublicDefinitionPath
} from '../public-config-paths'

export class AIAgentIgnoreInputCapability extends AbstractInputCapability {
  constructor() {
    super('AIAgentIgnoreInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const aindexDirName = ctx.userConfigOptions.aindex?.dir ?? 'aindex'
    const aindexDir = path.join(ctx.userConfigOptions.workspaceDir, aindexDirName)
    const proxyFilePath = path.join(aindexDir, 'public', 'proxy.ts')

    if (fs.existsSync(proxyFilePath)) {
      const results: {fileName: string, content: string, sourcePath: string}[] = []
      for (const fileName of AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS) {
        const resolvedPath = resolvePublicDefinitionPath(aindexDir, fileName, {workspaceDir: ctx.userConfigOptions.workspaceDir})
        if (fs.existsSync(resolvedPath)) {
          const content = fs.readFileSync(resolvedPath, 'utf8')
          if (content.length > 0) {
            results.push({fileName, content, sourcePath: resolvedPath})
          }
        }
      }
      return {aiAgentIgnoreConfigFiles: results.length > 0 ? results : void 0} as Partial<InputCollectedContext>
    }

    const native = getNativeBinding<{collectSharedIgnore?: (optionsJson: string) => string}>()
    if (native?.collectSharedIgnore != null) {
      const result = native.collectSharedIgnore(JSON.stringify(ctx.userConfigOptions))
      return JSON.parse(result) as Partial<InputCollectedContext>
    }

    throw new Error('Native collectSharedIgnore binding is not available')
  }
}
