#!/usr/bin/env node

import process from 'node:process'
import {runCli} from './cli-runtime'

void runCli(process.argv).then(exitCode => process.exit(exitCode))
