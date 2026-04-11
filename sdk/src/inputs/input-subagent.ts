import type {InputCapabilityContext, InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractInputCapability} from '../adaptors/adaptor-core'

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
      const parsed = JSON.parse(result) as NativeSubAgentResult
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
    }

    throw new Error('Native collectSubAgent binding is not available')
  }
}
