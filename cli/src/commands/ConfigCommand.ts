import type {Command, CommandContext, CommandResult} from './Command'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {DEFAULT_CONFIG_FILE_NAME, DEFAULT_GLOBAL_CONFIG_DIR} from '@/ConfigLoader'
import {buildUsageDiagnostic, diagnosticLines} from '@/diagnostics'

/**
 * Valid configuration keys that can be set via `tnmsc config key=value`.
 * Nested keys use dot-notation: aindex.skills.src, aindex.commands.src, etc.
 */
const VALID_CONFIG_KEYS = [
  'workspaceDir',
  'aindex.skills.src',
  'aindex.skills.dist',
  'aindex.commands.src',
  'aindex.commands.dist',
  'aindex.subAgents.src',
  'aindex.subAgents.dist',
  'aindex.rules.src',
  'aindex.rules.dist',
  'aindex.globalPrompt.src',
  'aindex.globalPrompt.dist',
  'aindex.workspacePrompt.src',
  'aindex.workspacePrompt.dist',
  'aindex.app.src',
  'aindex.app.dist',
  'aindex.ext.src',
  'aindex.ext.dist',
  'aindex.arch.src',
  'aindex.arch.dist',
  'logLevel'
] as const

type ValidConfigKey = typeof VALID_CONFIG_KEYS[number]

/**
 * Validate if a key is a valid config key
 */
function isValidConfigKey(key: string): key is ValidConfigKey {
  return VALID_CONFIG_KEYS.includes(key as ValidConfigKey)
}

/**
 * Validate log level value
 */
function isValidLogLevel(value: string): boolean {
  const validLevels = ['trace', 'debug', 'info', 'warn', 'error']
  return validLevels.includes(value)
}

/**
 * Get global config file path
 */
function getGlobalConfigPath(): string {
  return path.join(os.homedir(), DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME)
}

/**
 * Read global config file
 */
function readGlobalConfig(): ConfigObject {
  const configPath = getGlobalConfigPath()
  if (!fs.existsSync(configPath)) return {}
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(content) as ConfigObject
  }
  catch {
    return {}
  }
}

/**
 * Write global config file
 */
function writeGlobalConfig(config: ConfigObject): void {
  const configPath = getGlobalConfigPath()
  const configDir = path.dirname(configPath)

  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, {recursive: true}) // Ensure directory exists

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8') // Write with pretty formatting
}

type ConfigValue = string | ConfigObject
interface ConfigObject {
  [key: string]: ConfigValue | undefined
}

/**
 * Set a nested value in an object using dot-notation key
 */
function setNestedValue(obj: ConfigObject, key: string, value: string): void {
  const parts = key.split('.')
  let current: ConfigObject = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    const next = current[part]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) current[part] = {}
    current = current[part] as ConfigObject
  }
  current[parts.at(-1)!] = value
}

/**
 * Get a nested value from an object using dot-notation key
 */
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

  constructor(
    private readonly options: readonly [key: string, value: string][]
  ) { }

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger} = ctx

    if (this.options.length === 0) {
      logger.error(buildUsageDiagnostic({
        code: 'CONFIG_COMMAND_ARGUMENTS_MISSING',
        title: 'Config command requires at least one key=value pair',
        rootCause: diagnosticLines(
          'tnmsc config was invoked without any configuration assignments.'
        ),
        exactFix: diagnosticLines(
          'Run `tnmsc config key=value` with at least one supported configuration key.'
        ),
        possibleFixes: [
          diagnosticLines(`Use one of the supported keys: ${VALID_CONFIG_KEYS.join(', ')}`)
        ],
        details: {
          validKeys: [...VALID_CONFIG_KEYS]
        }
      }))
      logger.info('Usage: tnmsc config key=value')
      logger.info(`Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`)
      return {
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        message: 'No options provided'
      }
    }

    const config = readGlobalConfig() // Read existing config
    const errors: string[] = []
    const updated: string[] = []

    for (const [key, value] of this.options) { // Process each key-value pair
      if (!isValidConfigKey(key)) {
        errors.push(`Invalid key: ${key}`)
        logger.error(buildUsageDiagnostic({
          code: 'CONFIG_COMMAND_KEY_INVALID',
          title: `Unsupported config key: ${key}`,
          rootCause: diagnosticLines(
            `The config command received "${key}", which is not a supported configuration key.`
          ),
          exactFix: diagnosticLines('Use one of the supported config keys and rerun the command.'),
          possibleFixes: [
            diagnosticLines(`Supported keys: ${VALID_CONFIG_KEYS.join(', ')}`)
          ],
          details: {
            key,
            validKeys: [...VALID_CONFIG_KEYS]
          }
        }))
        continue
      }

      if (key === 'logLevel' && !isValidLogLevel(value)) { // Special validation for logLevel
        errors.push(`Invalid logLevel value: ${value}`)
        logger.error(buildUsageDiagnostic({
          code: 'CONFIG_COMMAND_LOG_LEVEL_INVALID',
          title: `Unsupported logLevel value: ${value}`,
          rootCause: diagnosticLines(
            `The config command received "${value}" for logLevel, but tnmsc does not support that level.`
          ),
          exactFix: diagnosticLines('Set logLevel to one of: trace, debug, info, warn, or error.'),
          details: {
            key,
            value,
            validLevels: ['trace', 'debug', 'info', 'warn', 'error']
          }
        }))
        continue
      }

      const oldValue = getNestedValue(config, key) // Update config
      setNestedValue(config, key, value)

      if (oldValue !== value) updated.push(`${key}=${value}`)

      logger.info('configuration updated', {key, value})
    }

    if (updated.length > 0) { // Write config if there are valid updates
      writeGlobalConfig(config)
      logger.info('global config written', {path: getGlobalConfigPath()})
    }

    const success = errors.length === 0
    const message = success
      ? `Configuration updated: ${updated.join(', ')}`
      : `Partial update: ${updated.join(', ')}. Errors: ${errors.join(', ')}`

    return {
      success,
      filesAffected: updated.length > 0 ? 1 : 0,
      dirsAffected: 0,
      message
    }
  }
}
