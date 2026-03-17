#!/usr/bin/env node

import process from 'node:process'
import {runMemorySyncMcpStdioServer} from './server'

void runMemorySyncMcpStdioServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
