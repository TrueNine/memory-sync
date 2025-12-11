#!/usr/bin/env node

/**
 * Single CLI entry point for the plugin-based toolchain
 */

import process from 'node:process'
import { PluginRunner } from '@/core'

// CLI工具只需要导出PluginRunner
export { PluginRunner } from './core'

void PluginRunner.main(process.argv.slice(2))