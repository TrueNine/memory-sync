#!/usr/bin/env node

import {realpathSync} from 'node:fs'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {runCli} from './cli-runtime'

function isCliEntrypoint(argv: readonly string[] = process.argv): boolean {
  const entryPath = argv[1]
  if (entryPath == null || entryPath.length === 0) return false

  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isCliEntrypoint()) void runCli(process.argv).then(exitCode => process.exit(exitCode))
