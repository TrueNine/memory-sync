import type { TrueNineConfig } from '../types'
import process from 'node:process'
import { confirm, intro, outro, select, spinner, text } from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { DEFAULT_CONFIG } from '../constants'
import { loadConfig, saveConfig } from '../utils'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/config')

async function showCurrentConfig(config: TrueNineConfig): Promise<void> {
  log.info('📋 Current Configuration:')
  log.info('  Project Name: {}', config.projectName)
  log.info('  Author: {}', config.author || '(not set)')
  log.info('  Description: {}', config.description)
  log.info('  Version: {}', config.version)

  log.info('🔧 Prompt Settings:')
  log.info('  Auto Build: {}', config.promptSettings.autoBuild ? 'enabled' : 'disabled')
  log.info('  Build on Save: {}', config.promptSettings.buildOnSave ? 'enabled' : 'disabled')
  log.info('  Output Format: {}', config.promptSettings.outputFormat)

  log.info('📁 Project Settings:')
  log.info('  Auto Sync: {}', config.projectSettings.autoSync ? 'enabled' : 'disabled')
  log.info('  Validate Structure: {}', config.projectSettings.validateStructure ? 'enabled' : 'disabled')
}

async function editConfig(config: TrueNineConfig): Promise<TrueNineConfig> {
  const newConfig = { ...config }

  const section = await select({
    message: 'Which section would you like to edit?',
    options: [
      { value: 'basic', label: 'Basic Information' },
      { value: 'prompt', label: 'Prompt Settings' },
      { value: 'project', label: 'Project Settings' },
      { value: 'done', label: 'Done editing' },
    ],
  })

  if (typeof section === 'symbol' || section === 'done') {
    return newConfig
  }

  switch (section) {
    case 'basic': {
      const projectName = await text({
        message: 'Project name:',
        defaultValue: newConfig.projectName,
      })

      const author = await text({
        message: 'Author name:',
        defaultValue: newConfig.author,
      })

      const description = await text({
        message: 'Description:',
        defaultValue: newConfig.description,
      })

      const version = await text({
        message: 'Version:',
        defaultValue: newConfig.version,
      })

      if (typeof projectName !== 'symbol') {
        newConfig.projectName = projectName
      }
      if (typeof author !== 'symbol') {
        newConfig.author = author
      }
      if (typeof description !== 'symbol') {
        newConfig.description = description
      }
      if (typeof version !== 'symbol') {
        newConfig.version = version
      }
      break
    }

    case 'prompt': {
      const autoBuild = await confirm({
        message: 'Enable auto build for prompts?',
        initialValue: newConfig.promptSettings.autoBuild,
      })

      const buildOnSave = await confirm({
        message: 'Build prompts on save?',
        initialValue: newConfig.promptSettings.buildOnSave,
      })

      const outputFormat = await select({
        message: 'Output format:',
        options: [
          { value: 'markdown', label: 'Markdown' },
          { value: 'json', label: 'JSON' },
          { value: 'yaml', label: 'YAML' },
        ],
        initialValue: newConfig.promptSettings.outputFormat,
      })

      if (typeof autoBuild !== 'symbol') {
        newConfig.promptSettings.autoBuild = autoBuild
      }
      if (typeof buildOnSave !== 'symbol') {
        newConfig.promptSettings.buildOnSave = buildOnSave
      }
      if (typeof outputFormat !== 'symbol') {
        newConfig.promptSettings.outputFormat = outputFormat
      }
      break
    }

    case 'project': {
      const autoSync = await confirm({
        message: 'Enable auto sync with projects directory?',
        initialValue: newConfig.projectSettings.autoSync,
      })

      const validateStructure = await confirm({
        message: 'Validate project structure?',
        initialValue: newConfig.projectSettings.validateStructure,
      })

      if (typeof autoSync !== 'symbol') {
        newConfig.projectSettings.autoSync = autoSync
      }
      if (typeof validateStructure !== 'symbol') {
        newConfig.projectSettings.validateStructure = validateStructure
      }
      break
    }
  }

  return newConfig
}

export async function configCommand(): Promise<void> {
  intro(pc.bgCyan(pc.black(' Configuration Management ')))

  const s = spinner()

  try {
    s.start('Loading configuration...')
    const config = await loadConfig()
    s.stop('Configuration loaded')

    const action = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'show', label: 'Show current configuration' },
        { value: 'edit', label: 'Edit configuration' },
        { value: 'reset', label: 'Reset to defaults' },
        { value: 'export', label: 'Export configuration' },
        { value: 'import', label: 'Import configuration' },
      ],
    })

    if (typeof action === 'symbol') {
      outro(pc.gray('Operation cancelled'))
      return
    }

    switch (action) {
      case 'show': {
        await showCurrentConfig(config)
        outro(pc.green('✓ Configuration displayed'))
        break
      }

      case 'edit': {
        const newConfig = await editConfig(config)

        const shouldSave = await confirm({
          message: 'Save changes?',
          initialValue: true,
        })

        if (shouldSave === true) {
          s.start('Saving configuration...')
          await saveConfig(newConfig)
          s.stop('Configuration saved')
          outro(pc.green('✓ Configuration updated'))
        } else {
          outro(pc.gray('Changes discarded'))
        }
        break
      }

      case 'reset': {
        const shouldReset = await confirm({
          message: 'Reset configuration to defaults? This will overwrite current settings.',
          initialValue: false,
        })

        if (shouldReset === true) {
          s.start('Resetting configuration...')
          await saveConfig(DEFAULT_CONFIG)
          s.stop('Configuration reset')
          outro(pc.green('✓ Configuration reset to defaults'))
        } else {
          outro(pc.gray('Reset cancelled'))
        }
        break
      }

      case 'export': {
        const exportPath = await text({
          message: 'Export path:',
          placeholder: './truenine-config.json',
          defaultValue: './truenine-config.json',
        })

        if (typeof exportPath !== 'symbol') {
          s.start('Exporting configuration...')
          await fs.writeJson(exportPath, config, { spaces: 2 })
          s.stop('Configuration exported')
          outro(pc.green(`Configuration exported to ${exportPath}`))
        } else {
          outro(pc.gray('Export cancelled'))
        }
        break
      }

      case 'import': {
        const importPath = await text({
          message: 'Import path:',
          placeholder: './truenine-config.json',
        })

        if (typeof importPath !== 'symbol') {
          if (await fs.pathExists(importPath)) {
            s.start('Importing configuration...')
            const importedConfig = await fs.readJson(importPath) as TrueNineConfig
            await saveConfig({ ...DEFAULT_CONFIG, ...importedConfig })
            s.stop('Configuration imported')
            outro(pc.green(`Configuration imported from ${importPath}`))
          } else {
            outro(pc.red(`File not found: ${importPath}`))
          }
        } else {
          outro(pc.gray('Import cancelled'))
        }
        break
      }
    }
  } catch (error) {
    s.stop('Operation failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
