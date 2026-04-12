import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {parseNativeInputResult} from './native-result'

export class ProjectPromptInputCapability extends AbstractInputCapability {
  constructor() {
    super('ProjectPromptInputCapability', ['AindexResolversInputCapability'])
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectProjectPrompt?: (optionsJson: string) => string}>()
    if (native?.collectProjectPrompt != null) {
      const payload = {
        ...ctx.userConfigOptions,
        aindexResolvers: ctx.userConfigOptions.aindex,
        globalScope: ctx.globalScope,
        workspace: ctx.dependencyContext.workspace
      }
      const result = native.collectProjectPrompt(JSON.stringify(payload))
      return parseNativeInputResult<Partial<InputCollectedContext>>(result)
    }

    throw new Error('Native collectProjectPrompt binding is not available')
  }
}
