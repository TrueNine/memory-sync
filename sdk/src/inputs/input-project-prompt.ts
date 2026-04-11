import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'

export class ProjectPromptInputCapability extends AbstractInputCapability {
  constructor() {
    super('ProjectPromptInputCapability', ['AindexInputCapability'])
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectProjectPrompt?: (optionsJson: string) => string}>()
    if (native?.collectProjectPrompt != null) {
      const payload = {
        ...ctx.userConfigOptions,
        globalScope: ctx.globalScope,
        workspace: ctx.dependencyContext.workspace
      }
      const result = native.collectProjectPrompt(JSON.stringify(payload))
      return JSON.parse(result) as Partial<InputCollectedContext>
    }

    throw new Error('Native collectProjectPrompt binding is not available')
  }
}
