#!/usr/bin/env node

import {existsSync, realpathSync} from 'node:fs'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {runCli} from './cli-runtime'

export * from './Aindex'
export * from './cli-runtime'
export * from './config'
export * from './ConfigLoader'
export {
  createDefaultPluginConfig
} from './plugin.config'
export * from './PluginPipeline'
export {
  DEFAULT_USER_CONFIG,
  PathPlaceholders
} from './plugins/plugin-core'

export * from './prompts'

function isCliEntrypoint(argv: readonly string[] = process.argv): boolean {
  const entryPath = argv[1]
  if (entryPath == null || entryPath.length === 0 || !existsSync(entryPath)) return false

  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url))
  }
  catch {
    return false
  }
}

if (isCliEntrypoint()) void runCli(process.argv).then(exitCode => process.exit(exitCode))
