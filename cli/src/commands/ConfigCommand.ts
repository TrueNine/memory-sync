import type {AindexConfigKeyPath} from '@truenine/memory-sync-sdk'
import type {Command, CommandContext, CommandResult} from './Command'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {AINDEX_CONFIG_KEY_PATHS, buildUsageDiagnostic, diagnosticLines, getRequiredGlobalConfigPath} from '@truenine/memory-sync-sdk'

type ValidConfigKey = 'workspaceDir' | 'logLevel' | AindexConfigKeyPath
const VALID_CONFIG_KEYS: readonly ValidConfigKey[] = ['workspaceDir', ...AINDEX_CONFIG_KEY_PATHS, 'logLevel']

function isValidConfigKey(key: string): key is ValidConfigKey {
  return VALID_CONFIG_KEYS.includes(key as ValidConfigKey)
}

function isValidLogLevel(value: string): boolean {
  return ['trace', 'debug', 'info', 'warn', 'error'].includes(value)
}

type ConfigValue = string | ConfigObject
interface ConfigObject {
  [key: string]: ConfigValue | undefined
}

function readGlobalConfig(): ConfigObject {
  const configPath = getRequiredGlobalConfigPath()
  if (!fs.existsSync(configPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as ConfigObject
  } catch {
    return {}
  }
}

function writeGlobalConfig(config: ConfigObject): void {
  const configPath = getRequiredGlobalConfigPath()
  const configDir = path.dirname(configPath)
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, {recursive: true})
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function setNestedValue(obj: ConfigObject, key: string, value: string): void {
  const parts = key.split('.')
  let current: ConfigObject = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (part == null) continue
    const next = current[part]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) current[part] = {}
    current = current[part] as ConfigObject
  }
  const lastPart = parts.at(-1)
  if (lastPart != null) current[lastPart] = value
}

function getNestedValue(obj: ConfigObject, key: string): ConfigValue | undefined {
  const parts = key.split('.')
  let current: ConfigValue | undefined = obj
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return void 0
    current = current[part]
  }
  return current
}

export class ConfigCommand implements Command {
  readonly name = 'config'

  constructor(private readonly options: readonly [key: string, value: string][]) {}

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger} = ctx

    if (this.options.length === 0) {
      logger.error(
        buildUsageDiagnostic({
          code: 'CONFIG_COMMAND_ARGUMENTS_MISSING',
          title: 'Config command requires at least one key=value pair',
          rootCause: diagnosticLines('tnmsc config was invoked without any configuration assignments.'),
          exactFix: diagnosticLines('Run `tnmsc config key=value` with at least one supported configuration key.'),
          possibleFixes: [diagnosticLines(`Use one of the supported keys: ${VALID_CONFIG_KEYS.join(', ')}`)],
          details: {validKeys: [...VALID_CONFIG_KEYS]}
        })
      )
      logger.info('Usage: tnmsc config key=value')
      logger.info(`Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`)
      return {success: false, filesAffected: 0, dirsAffected: 0, message: 'No options provided'}
    }

    let config: ConfigObject
    try {
      config = readGlobalConfig()
    } catch (error) {
      return {success: false, filesAffected: 0, dirsAffected: 0, message: error instanceof Error ? error.message : String(error)}
    }

    const errors: string[] = []
    const updated: string[] = []
    for (const [key, value] of this.options) {
      if (!isValidConfigKey(key)) {
        errors.push(`Invalid key: ${key}`)
        logger.error(
          buildUsageDiagnostic({
            code: 'CONFIG_COMMAND_KEY_INVALID',
            title: `Unsupported config key: ${key}`,
            rootCause: diagnosticLines(`The config command received "${key}", which is not a supported configuration key.`),
            exactFix: diagnosticLines('Use one of the supported config keys and rerun the command.'),
            possibleFixes: [diagnosticLines(`Supported keys: ${VALID_CONFIG_KEYS.join(', ')}`)],
            details: {key, validKeys: [...VALID_CONFIG_KEYS]}
          })
        )
        continue
      }

      if (key === 'logLevel' && !isValidLogLevel(value)) {
        errors.push(`Invalid logLevel value: ${value}`)
        logger.error(
          buildUsageDiagnostic({
            code: 'CONFIG_COMMAND_LOG_LEVEL_INVALID',
            title: `Unsupported logLevel value: ${value}`,
            rootCause: diagnosticLines(`The config command received "${value}" for logLevel, but tnmsc does not support that level.`),
            exactFix: diagnosticLines('Set logLevel to one of: trace, debug, info, warn, or error.'),
            details: {key, value, validLevels: ['trace', 'debug', 'info', 'warn', 'error']}
          })
        )
        continue
      }

      const oldValue = getNestedValue(config, key)
      setNestedValue(config, key, value)
      if (oldValue !== value) updated.push(`${key}=${value}`)
      logger.info('configuration updated', {key, value})
    }

    if (updated.length > 0) {
      try {
        writeGlobalConfig(config)
      } catch (error) {
        return {success: false, filesAffected: 0, dirsAffected: 0, message: error instanceof Error ? error.message : String(error)}
      }
      logger.info('global config written', {path: getRequiredGlobalConfigPath()})
    }

    const success = errors.length === 0
    return {
      success,
      filesAffected: updated.length > 0 ? 1 : 0,
      dirsAffected: 0,
      message: success ? `Configuration updated: ${updated.join(', ')}` : `Partial update: ${updated.join(', ')}. Errors: ${errors.join(', ')}`
    }
  }
}
