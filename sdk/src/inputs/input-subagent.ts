import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {parseLoggedNativeInputResult} from './native-result'

interface NativeSubAgentResult extends InputCollectedContext {
  diagnostics?: {level: string, code: string, title: string, exactFix?: string[]}[]
  debugLogs?: {message: string, payload?: unknown}[]
}

export class SubAgentInputCapability extends AbstractInputCapability {
  constructor() {
    super('SubAgentInputCapability')
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectSubAgent?: (optionsJson: string) => string}>()
    if (native?.collectSubAgent != null) {
      const payload = {...ctx.userConfigOptions, globalScope: ctx.globalScope}
      const result = native.collectSubAgent(JSON.stringify(payload))
      const parsed = parseLoggedNativeInputResult<NativeSubAgentResult>(ctx.logger, result)
      return parsed as Partial<InputCollectedContext>
    }

    throw new Error('Native collectSubAgent binding is not available')
  }
}
