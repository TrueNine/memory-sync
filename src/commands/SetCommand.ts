import type {Command, CommandContext, CommandResult} from './Command'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {DEFAULT_CONFIG_FILE_NAME, DEFAULT_GLOBAL_CONFIG_DIR} from '@/ConfigLoader'

/**
 * Valid configuration keys that can be set
 */
const VALID_CONFIG_KEYS = [
  'workspaceDir',
  'shadowSourceProjectDir',
  'shadowSkillSourceDir',
  'shadowFastCommandDir',
  'shadowSubAgentDir',
  'globalMemoryFile',
  'shadowProjectsDir',
  'logLevel',
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
function readGlobalConfig(): Record<string, unknown> {
  const configPath = getGlobalConfigPath()
  if (!fs.existsSync(configPath)) return {}
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Write global config file
 */
function writeGlobalConfig(config: Record<string, unknown>): void {
  const configPath = getGlobalConfigPath()
  const configDir = path.dirname(configPath)

  // Ensure directory exists
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, {recursive: true})

  // Write with pretty formatting
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

/**
 * Set command - set configuration values in global config
 *
 * Usage:
 *   tnmsc --set workspaceDir=/path/to/workspace
 *   tnmsc --set logLevel=debug
 *   tnmsc set workspaceDir=/path/to/workspace
 *   tnmsc set logLevel=debug
 */
export class SetCommand implements Command {
  readonly name = 'set'

  constructor(
    private readonly options: readonly [key: string, value: string][],
  ) { }

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger} = ctx

    if (this.options.length === 0) {
      logger.error('No configuration key-value pairs provided')
      logger.info('Usage: tnmsc --set key=value or tnmsc set key=value')
      logger.info(`Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`)
      return {
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        message: 'No options provided',
      }
    }

    // Read existing config
    const config = readGlobalConfig()
    const errors: string[] = []
    const updated: string[] = []

    // Process each key-value pair
    for (const [key, value] of this.options) {
      if (!isValidConfigKey(key)) {
        errors.push(`Invalid key: ${key} (valid keys: ${VALID_CONFIG_KEYS.join(', ')})`)
        continue
      }

      // Special validation for logLevel
      if (key === 'logLevel' && !isValidLogLevel(value)) {
        errors.push(`Invalid logLevel value: ${value} (must be: trace, debug, info, warn, or error)`)
        continue
      }

      // Update config
      const oldValue = config[key]
      config[key] = value

      if (oldValue !== value) updated.push(`${key}=${value}`)

      logger.info('configuration updated', {key, value})
    }

    // Write config if there are valid updates
    if (updated.length > 0) {
      writeGlobalConfig(config)
      logger.info('global config written', {path: getGlobalConfigPath()})
    }

    // Handle errors
    if (errors.length > 0) {
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
      message,
    }
  }
}
