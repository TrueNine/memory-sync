import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {parseNativeInputResult} from './native-result'

export class NativeInputCapability extends AbstractInputCapability {
  constructor(
    name: string,
    private readonly nativeMethodName: string,
    dependsOn?: readonly string[]
  ) {
    super(name, dependsOn)
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const native = getNativeBinding<Record<string, (optionsJson: string) => string>>()
    const fn = native?.[this.nativeMethodName]
    if (fn != null) {
      const result = fn(JSON.stringify(ctx.userConfigOptions))
      return parseNativeInputResult<Partial<InputCollectedContext>>(result)
    }
    throw new Error(`Native binding ${this.nativeMethodName} is not available`)
  }
}
