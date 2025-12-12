#!/usr/bin/env node

/**
 * Single CLI entry point for the plugin-based toolchain
 */

import process from 'node:process'
import { PluginRunner } from '@/core'

// CLI工具只需要导出PluginRunner
export { PluginRunner } from './core'

/**
 * Parse CLI arguments
 * Supports only --dry-run/-d and --clean/-c flags
 */
export function parseArgs(args: string[]): { flags: { dryRun: boolean, clean: boolean }, invalidFlags: string[] } {
  const flags = { dryRun: false, clean: false }
  const invalidFlags: string[] = []

  for (const arg of args) {
    switch (arg) {
      case '--dry-run':
      case '-d':
        flags.dryRun = true
        break
      case '--clean':
      case '-c':
        flags.clean = true
        break
      default:
        if (arg.startsWith('-')) {
          invalidFlags.push(arg)
        }
        break
    }
  }

  return { flags, invalidFlags }
}

void PluginRunner.main(process.argv.slice(2))
