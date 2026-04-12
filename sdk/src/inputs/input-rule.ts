import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {parseNativeInputResult} from './native-result'

export class RuleInputCapability extends AbstractInputCapability {
  constructor() {
    super('RuleInputCapability')
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectRule?: (optionsJson: string) => string}>()
    if (native?.collectRule != null) {
      const payload = {...ctx.userConfigOptions, globalScope: ctx.globalScope}
      const result = native.collectRule(JSON.stringify(payload))
      return parseNativeInputResult<Partial<InputCollectedContext>>(result)
    }

    throw new Error('Native collectRule binding is not available')
  }
}
