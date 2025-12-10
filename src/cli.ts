#!/usr/bin/env node
import process from 'node:process'
import { cac } from 'cac'
import { autoSyncCommand } from './commands'
import { configCommand } from './commands/config'
import { depCheckCommand } from './commands/depCheck'
import { depUpdateCommand } from './commands/depUpdate'
import { docLinkCommand } from './commands/docLink'
import { initCommand } from './commands/init'
import { kiroAgentsExportCommand } from './commands/kiroAgentsExport'
import { kiroSteeringExportCommand } from './commands/kiroSteeringExport'
import { mapAgentsClaudeCommand } from './commands/mapAgentsClaude'
import { projectSelectCommand } from './commands/projectSelect'
import { promptBuildCommand } from './commands/promptBuild'
import { qoderExportCommand } from './commands/qoderExport'
import { skillsSyncCommand } from './commands/skillsSync'
import { LogAdapter, shutdownLogger } from './utils/log'

const log = new LogAdapter('cli')
const cli = cac('tn')

// Auto sync command
cli
  .command('auto', 'Run automatic sync and mapping workflow')
  .option('-p, --plugin <plugins>', 'Filter plugins by name (comma-separated)', {
    default: '',
  })
  .action(async (options: { plugin: string }) => {
    try {
      const plugins = options.plugin
        ? options.plugin.split(',').map((p) => p.trim()).filter(Boolean)
        : []
      await autoSyncCommand({ plugins })
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Config command
cli
  .command('config', 'Manage project configuration')
  .action(async () => {
    try {
      await configCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Dependency check command
cli
  .command('dep:check', 'Check for outdated dependencies')
  .action(async () => {
    try {
      await depCheckCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Dependency update command
cli
  .command('dep:update', 'Update dependencies to latest versions')
  .action(async () => {
    try {
      await depUpdateCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Document link command
cli
  .command('doc:link', 'Create symbolic links for project documentation')
  .action(async () => {
    try {
      await docLinkCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Init command
cli
  .command('init', 'Initialize a new TrueNine project')
  .action(async () => {
    try {
      await initCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Kiro agents export command
cli
  .command('kiro:agents-export', 'Export AGENTS.md files to Kiro steering directory with fileMatch front matter')
  .action(async () => {
    try {
      await kiroAgentsExportCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Kiro steering export command
cli
  .command('kiro:export', 'Export GLOBAL.md to Kiro steering directory with inclusion: always front matter')
  .action(async () => {
    try {
      await kiroSteeringExportCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Map AGENTS to CLAUDE command
// Note: As of 2024-10-30, this command only copies AGENTS.md to CLAUDE.md
// The .cursor/rules generation has been removed since Cursor now natively supports AGENTS.md
cli
  .command('map:agents-claude', 'Copy AGENTS.md files to CLAUDE.md (for Claude Code)')
  .action(async () => {
    try {
      await mapAgentsClaudeCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Project select command
cli
  .command('project:select', 'Select and configure projects for sync')
  .action(async () => {
    try {
      await projectSelectCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Prompt build command
cli
  .command('prompt:build', 'Build prompts from source files')
  .action(async () => {
    try {
      await promptBuildCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Qoder export command
cli
  .command('qoder export', 'Export AGENTS.md files to qoder rules')
  .action(async () => {
    try {
      await qoderExportCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Skills sync command
cli
  .command('skills:sync', 'Sync dist/skills/ to .claude/skills/ and .factory/skills/')
  .action(async () => {
    try {
      await skillsSyncCommand()
    } catch (error) {
      log.error('{}', error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
    await shutdownLogger()
  })

// Help command
cli.help()

// Version command
cli.version('0.0.1')

cli.parse()
