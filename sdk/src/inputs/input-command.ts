import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'

export class CommandInputCapability extends AbstractInputCapability {
  constructor() {
    super('CommandInputCapability')
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectCommand?: (optionsJson: string) => string}>()
    if (native?.collectCommand != null) {
      const payload = {...ctx.userConfigOptions, globalScope: ctx.globalScope}
      const result = native.collectCommand(JSON.stringify(payload))
      return JSON.parse(result) as Partial<InputCollectedContext>
    }

    throw new Error('Native collectCommand binding is not available')
  }
}
