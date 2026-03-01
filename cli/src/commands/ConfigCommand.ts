import type {Command, CommandContext, CommandResult} from './Command'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {DEFAULT_CONFIG_FILE_NAME, DEFAULT_GLOBAL_CONFIG_DIR} from '@/ConfigLoader'

/**
 * Valid configuration keys that can be set via `tnmsc config key=value`.
 * Nested keys use dot-notation: shadowSourceProject.name, shadowSourceProject.skill.src, etc.
 */
const VALID_CONFIG_KEYS = [
  'workspaceDir',
  'shadowSourceProject.name',
  'shadowSourceProject.skill.src',
  'shadowSourceProject.skill.dist',
  'shadowSourceProject.fastCommand.src',
  'shadowSourceProject.fastCommand.dist',
  'shadowSourceProject.subAgent.src',
  'shadowSourceProject.subAgent.dist',
  'shadowSourceProject.rule.src',
  'shadowSourceProject.rule.dist',
  'shadowSourceProject.globalMemory.src',
  'shadowSourceProject.globalMemory.dist',
  'shadowSourceProject.workspaceMemory.src',
  'shadowSourceProject.workspaceMemory.dist',
  'shadowSourceProject.project.src',
  'shadowSourceProject.project.dist',
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
      logger.error('No configuration key-value pairs provided')
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
        errors.push(`Invalid key: ${key} (valid keys: ${VALID_CONFIG_KEYS.join(', ')})`)
        continue
      }

      if (key === 'logLevel' && !isValidLogLevel(value)) { // Special validation for logLevel
        errors.push(`Invalid logLevel value: ${value} (must be: trace, debug, info, warn, or error)`)
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

    if (errors.length > 0) { // Handle errors
      for (const error of errors) logger.error(error)
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
