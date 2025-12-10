import type { InitOptions } from '../types'
import path from 'node:path'
import process from 'node:process'
import { confirm, intro, outro, spinner, text } from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { DIRECTORY_STRUCTURE } from '../constants'
import {
  generateBasicTemplate,
  generateEditorConfig,
  generateGitIgnore,
  generateProjectTemplate,
  generateReadme,
} from '../utils'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/init')

async function createDirectoryStructure(basePath: string): Promise<void> {
  for (const dir of DIRECTORY_STRUCTURE) {
    const fullPath = path.join(basePath, dir)
    await fs.ensureDir(fullPath)
  }
}

async function createConfigFiles(basePath: string, options: InitOptions): Promise<void> {
  await fs.writeFile(path.join(basePath, '.editorconfig'), generateEditorConfig())
  await fs.writeFile(path.join(basePath, '.gitignore'), generateGitIgnore())
  await fs.writeFile(path.join(basePath, 'README.md'), generateReadme(options))
}

async function createBasicTemplates(basePath: string): Promise<void> {
  await fs.writeFile(path.join(basePath, 'templates/basic.md'), generateBasicTemplate())
  await fs.writeFile(path.join(basePath, 'templates/project.md'), generateProjectTemplate())
}

export async function initCommand(): Promise<void> {
  intro(pc.bgCyan(pc.black(' aindex Initialization ')))

  const s = spinner()

  try {
    // Get current working directory
    const currentDir = process.cwd()

    // Check if already initialized
    const airefExists = await fs.pathExists(path.join(currentDir, 'ref'))
    const aiExists = await fs.pathExists(path.join(currentDir, '_ai'))

    if (airefExists || aiExists) {
      const shouldContinue = await confirm({
        message: 'aindex structure already exists. Continue anyway?',
      })

      if (shouldContinue !== true) {
        outro(pc.gray('Initialization cancelled'))
        return
      }
    }

    // Collect project information
    const projectName = await text({
      message: 'Project name:',
      placeholder: 'My Knowledge Base',
      defaultValue: path.basename(currentDir),
    })

    const author = await text({
      message: 'Author name:',
      placeholder: 'Your Name',
    })

    const description = await text({
      message: 'Project description:',
      placeholder: 'Personal digital knowledge base and prompt engineering workspace',
    })

    if (typeof projectName === 'symbol' || typeof author === 'symbol' || typeof description === 'symbol') {
      outro(pc.gray('Initialization cancelled'))
      return
    }

    const options: InitOptions = {
      projectName,
      author,
      description,
    }

    s.start('Creating directory structure...')
    await createDirectoryStructure(currentDir)
    s.stop('Directory structure created')

    s.start('Creating configuration files...')
    await createConfigFiles(currentDir, options)
    s.stop('Configuration files created')

    s.start('Creating templates...')
    await createBasicTemplates(currentDir)
    s.stop('Templates created')

    // Initialize git if not already initialized
    const gitExists = await fs.pathExists(path.join(currentDir, '.git'))
    if (!gitExists) {
      const initGit = await confirm({
        message: 'Initialize git repository?',
        initialValue: true,
      })

      if (initGit === true) {
        s.start('Initializing git repository...')
        const { execa } = await import('execa')
        await execa('git', ['init'], { cwd: currentDir })
        s.stop('Git repository initialized')
      }
    }

    outro(pc.green('✓ aindex project initialized successfully!'))

    log.info('Next steps:')
    log.info('1. Install dependencies: pnpm install')
    log.info('2. Start building your knowledge base')
    log.info('3. Use "tn" command to manage projects')
  } catch (error) {
    s.stop('Initialization failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
