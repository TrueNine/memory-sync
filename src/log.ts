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
      winston.format.json(),
    ),
    transports: [new winston.transports.Console()],
  })
}
