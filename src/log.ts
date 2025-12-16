import process from 'node:process'
import winston from 'winston'

export type Logger = winston.Logger

export function createLogger(scope: string, logLevel?: string): Logger {
  return winston.createLogger({
    level: logLevel ?? process.env['LOG_LEVEL'] ?? 'info',
    defaultMeta: { scope },
    format: winston.format.combine(
      winston.format.timestamp({
        format: () => Date.now().toString(),
      }),
      winston.format.printf((info) => {
        const { timestamp, level, message, scope, ...rest } = info
        const hasRest = Object.keys(rest).length > 0
        const base = { $: [Number(timestamp), level, scope] }
        if (message == null) {
          return JSON.stringify(base)
        }
        return JSON.stringify({ ...base, msg: hasRest ? { [message as string]: rest } : message })
      }),
    ),
    transports: [new winston.transports.Console()],
  })
}
