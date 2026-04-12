import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'

import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {parseLoggedNativeInputResult} from './native-result'

interface NativeSkillResult extends InputCollectedContext {
  diagnostics?: {level: string, code: string, title: string, exactFix?: string[]}[]
  debugLogs?: {message: string, payload?: unknown}[]
}

export class SkillInputCapability extends AbstractInputCapability {
  constructor() {
    super('SkillInputCapability')
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectSkill?: (optionsJson: string) => string}>()
    if (native?.collectSkill != null) {
      const payload = {
        ...ctx.userConfigOptions,
        globalScope: ctx.globalScope
      }
      const result = native.collectSkill(JSON.stringify(payload))
      const parsed = parseLoggedNativeInputResult<NativeSkillResult>(ctx.logger, result)
      return parsed as Partial<InputCollectedContext>
    }

    throw new Error('Native collectSkill binding is not available')
  }
}
