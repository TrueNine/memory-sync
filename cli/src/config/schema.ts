/**
 * Zod validation schemas for the TNMSC configuration system.
 *
 * This module provides runtime validation for configuration files,
 * ensuring all required fields exist and have valid formats.
 */

import type {
  AindexConfig,
  LogLevel,
  ModulePaths,
  Profile,
  TnmscConfig
} from './types'
import {z} from 'zod/v3'

const VERSION_REGEX = /^\d{4}\.\d{5}\.\d{5}$/

const BIRTHDAY_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valid log level values.
 */
const VALID_LOG_LEVELS: Set<LogLevel> = new Set(['trace', 'debug', 'info', 'warn', 'error'])

/**
 * Zod schema for module path pairs (src/dist).
 */
export const ZModulePaths = z.object({
  src: z.string().min(1, 'Source path cannot be empty'),
  dist: z.string().min(1, 'Distribution path cannot be empty')
}) satisfies z.ZodType<ModulePaths>

/**
 * Zod schema for aindex configuration.
 */
export const ZAindexConfig = z.object({
  name: z.string().min(1, 'Aindex name cannot be empty'),
  skills: ZModulePaths,
  commands: ZModulePaths,
  subAgents: ZModulePaths,
  rules: ZModulePaths,
  globalPrompt: ZModulePaths,
  workspacePrompt: ZModulePaths,
  app: ZModulePaths,
  ext: ZModulePaths,
  arch: ZModulePaths
}) satisfies z.ZodType<AindexConfig>

/**
 * Zod schema for user profile.
 */
export const ZProfile = z.object({
  name: z.string().min(1, 'Profile name cannot be empty'),
  username: z.string().min(1, 'Username cannot be empty'),
  gender: z.string().min(1, 'Gender cannot be empty'),
  birthday: z.string()
    .regex(BIRTHDAY_REGEX, 'Birthday must be in YYYY-MM-DD format')
}) satisfies z.ZodType<Profile>

/**
 * Zod schema for the main TNMSC configuration.
 */
export const ZTnmscConfig = z.object({
  version: z.string()
    .regex(VERSION_REGEX, 'Version must be in YYYY.MMDD.HHMM format'),
  workspaceDir: z.string().min(1, 'Workspace directory cannot be empty'),
  aindex: ZAindexConfig,
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
  profile: ZProfile
}) satisfies z.ZodType<TnmscConfig>

/**
 * Validate a configuration object against the schema.
 *
 * @param config - The configuration object to validate
 * @returns The validated configuration
 * @throws {z.ZodError} If validation fails
 */
export function validateConfig(config: unknown): TnmscConfig {
  return ZTnmscConfig.parse(config)
}

/**
 * Safely validate a configuration object against the schema.
 *
 * @param config - The configuration object to validate
 * @returns An object with success flag and either data or error
 */
export function safeValidateConfig(config: unknown):
  | {success: true, data: TnmscConfig}
  | {success: false, error: z.ZodError} {
  const result = ZTnmscConfig.safeParse(config)
  if (result.success) return {success: true, data: result.data}
  return {success: false, error: result.error}
}

/**
 * Format validation errors into human-readable messages.
 *
 * @param error - The Zod error to format
 * @returns Array of error message strings
 */
export function formatValidationErrors(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `${path}: ${issue.message}`
  })
}

/**
 * Check if a value is a valid log level.
 *
 * @param value - The value to check
 * @returns True if the value is a valid log level
 */
export function isValidLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && VALID_LOG_LEVELS.has(value as LogLevel)
}

/**
 * Get the default configuration values.
 *
 * @returns A partial configuration with default values
 */
export function getDefaultConfig(): Partial<TnmscConfig> {
  return {
    version: '2026.00000.00000',
    workspaceDir: '~/project',
    logLevel: 'info',
    aindex: {
      name: 'aindex',
      skills: {src: 'skills', dist: 'dist/skills'},
      commands: {src: 'commands', dist: 'dist/commands'},
      subAgents: {src: 'agents', dist: 'dist/agents'},
      rules: {src: 'rules', dist: 'dist/rules'},
      globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
      workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
      app: {src: 'app', dist: 'dist/app'},
      ext: {src: 'ext', dist: 'dist/ext'},
      arch: {src: 'arch', dist: 'dist/arch'}
    },
    profile: {
      name: '',
      username: '',
      gender: '',
      birthday: ''
    }
  }
}

export { // Re-export types for convenience
  type AindexConfig,
  type LogLevel,
  type ModulePaths,
  type Profile,
  type TnmscConfig
} from './types'
