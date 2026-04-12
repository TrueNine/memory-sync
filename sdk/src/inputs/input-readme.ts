import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {parseNativeInputResult} from './native-result'

function deriveErrorCode(message: string): string | void {
  if (message.includes('Readme project series name conflict')) {
    return 'README_PROJECT_SERIES_NAME_CONFLICT'
  }
  return void 0
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class ReadmeMdInputCapability extends AbstractInputCapability {
  constructor() {
    super('ReadmeMdInputCapability', ['AindexResolversInputCapability'])
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectReadme?: (optionsJson: string) => string}>()
    if (native?.collectReadme != null) {
      try {
        const result = native.collectReadme(JSON.stringify(ctx.userConfigOptions))
        return parseNativeInputResult<Partial<InputCollectedContext>>(result)
      } catch (err: unknown) {
        const message = getErrorMessage(err)
        const code = deriveErrorCode(message)
        if (code != null) {
          ctx.logger.error({code, title: message, rootCause: [message]})
        }
        throw err
      }
    }

    throw new Error('Native collectReadme binding is not available')
  }
}
