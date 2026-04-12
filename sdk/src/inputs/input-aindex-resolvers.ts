import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {parseLoggedNativeInputResult} from './native-result'

interface NativeAindexResult extends InputCollectedContext {
  diagnostics?: {level: string, code: string, title: string, exactFix?: string[]}[]
  debugLogs?: {message: string, payload?: unknown}[]
}

function deriveErrorCode(message: string): string | void {
  if (message.includes('Aindex project series name conflict')) {
    return 'AINDEX_PROJECT_SERIES_NAME_CONFLICT'
  }
  return void 0
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class AindexResolversInputCapability extends AbstractInputCapability {
  constructor() {
    super('AindexResolversInputCapability')
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectAindexResolvers?: (optionsJson: string) => string}>()
    if (native?.collectAindexResolvers != null) {
      const payload = {
        ...ctx.userConfigOptions,
        aindexResolvers: ctx.userConfigOptions.aindex
      }
      try {
        const result = native.collectAindexResolvers(JSON.stringify(payload))
        const parsed = parseLoggedNativeInputResult<NativeAindexResult>(ctx.logger, result)
        return parsed as Partial<InputCollectedContext>
      } catch (err: unknown) {
        const message = getErrorMessage(err)
        const code = deriveErrorCode(message)
        if (code != null) {
          ctx.logger.error({code, title: message, rootCause: [message]})
        }
        throw err
      }
    }

    throw new Error('Native collectAindexResolvers binding is not available')
  }
}
