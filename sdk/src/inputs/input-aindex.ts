import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'

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

export class AindexInputCapability extends AbstractInputCapability {
  constructor() {
    super('AindexInputCapability')
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const native = getNativeBinding<{collectAindex?: (optionsJson: string) => string}>()
    if (native?.collectAindex != null) {
      const payload = {...ctx.userConfigOptions}
      try {
        const result = native.collectAindex(JSON.stringify(payload))
        const parsed = JSON.parse(result) as NativeAindexResult
        if (parsed.diagnostics != null) {
          for (const diagnostic of parsed.diagnostics) {
            const input = {
              code: diagnostic.code,
              title: diagnostic.title,
              rootCause: [diagnostic.title] as const,
              ...diagnostic.exactFix != null && diagnostic.exactFix.length > 0
                ? {exactFix: diagnostic.exactFix as [string, ...string[]]}
                : {}
            }
            if (diagnostic.level === 'warn') {
              ctx.logger.warn(input)
            } else if (diagnostic.level === 'error') {
              ctx.logger.error(input)
            }
          }
        }
        if (parsed.debugLogs != null) {
          for (const log of parsed.debugLogs) {
            ctx.logger.debug(log.message, log.payload)
          }
        }
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

    throw new Error('Native collectAindex binding is not available')
  }
}
