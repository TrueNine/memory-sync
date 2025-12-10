import path from 'node:path'
import process from 'node:process'
import { confirm, intro, outro, select, spinner } from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { PathBuilder } from '../constants/paths'
import { findFilesByExtension, pathExists } from '../utils'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/promptBuild')

// Build paths using PathBuilder
const aindexPaths = PathBuilder.forProject('aindex')
const AINDEX_ROOT = aindexPaths.root()

async function buildPromptFile(srcPath: string, distPath: string): Promise<void> {
  const content = await fs.readFile(srcPath, 'utf-8')

  // Basic processing - convert from source format to distribution format
  // This could be enhanced with more sophisticated processing
  const processedContent = content

  // Remove development comments and metadata if needed
  // Add any transformations here

  // Ensure dist directory exists
  await fs.ensureDir(path.dirname(distPath))

  // Write processed content
  await fs.writeFile(distPath, processedContent, 'utf-8')
}

export async function promptBuildCommand(): Promise<void> {
  intro(pc.bgCyan(pc.black(' Prompt Build ')))

  const s = spinner()

  try {
    const srcPath = path.join(AINDEX_ROOT, '_ai/src')
    const distPath = path.join(AINDEX_ROOT, '_ai/dist')

    s.start('Scanning for prompt files...')

    if (!(await pathExists(srcPath))) {
      s.stop('Source directory not found')
      outro(pc.red(`Source directory not found: ${srcPath}`))
      process.exitCode = 1
      return
    }

    const promptFiles = await findFilesByExtension(srcPath, '.md')
    s.stop('Scan complete')

    if (promptFiles.length === 0) {
      outro(pc.yellow('No prompt files found in _ai/src'))
      return
    }

    log.info('Found {} prompt files:', promptFiles.length)
    promptFiles.forEach((file) => {
      const relativePath = path.relative(srcPath, file.path)
      log.debug('  • {} ({} bytes)', relativePath, file.size)
    })

    const action = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'build-all', label: 'Build all prompt files' },
        { value: 'build-selected', label: 'Build selected files' },
        { value: 'preview', label: 'Preview build process' },
        { value: 'cancel', label: 'Cancel' },
      ],
    })

    if (typeof action === 'symbol' || action === 'cancel') {
      outro(pc.gray('Build cancelled'))
      return
    }

    if (action === 'preview') {
      s.start('Previewing build process...')

      log.info('Build preview:')
      for (const file of promptFiles) {
        const relativeSrcPath = path.relative(srcPath, file.path)
        const relativeDistPath = path.relative(distPath, path.join(distPath, relativeSrcPath))
        log.debug('{} → {}', relativeSrcPath, relativeDistPath)
      }

      s.stop('Preview complete')
      outro(pc.green('✓ Build preview complete'))
      return
    }

    if (action === 'build-selected') {
      // TODO: Implement file selection
      outro(pc.yellow('File selection not yet implemented'))
      return
    }

    // Build all files
    const shouldBuild = await confirm({
      message: `Build all ${promptFiles.length} prompt files?`,
      initialValue: true,
    })

    if (shouldBuild !== true) {
      outro(pc.gray('Build cancelled'))
      return
    }

    s.start('Building prompt files...')

    let successCount = 0
    let errorCount = 0

    for (const file of promptFiles) {
      try {
        const relativeSrcPath = path.relative(srcPath, file.path)
        const relativeDistPath = relativeSrcPath.replace(/\.src\.md$/, '.md')
        const distFilePath = path.join(distPath, relativeDistPath)

        await buildPromptFile(file.path, distFilePath)
        successCount++
      } catch (error) {
        log.error('Failed to build {}:', file.name)
        log.error('{}', error instanceof Error ? error.message : String(error))
        errorCount++
      }
    }

    s.stop('Build complete')

    if (errorCount === 0) {
      outro(pc.green(`Successfully built ${successCount} prompt files`))
    } else {
      outro(pc.yellow(`Built ${successCount} files, ${errorCount} errors`))
    }
  } catch (error) {
    s.stop('Build failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
