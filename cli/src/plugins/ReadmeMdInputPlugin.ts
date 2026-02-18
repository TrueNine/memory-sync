import type {CollectedInputContext, InputPluginContext, ReadmePrompt, RelativePath} from '@/types'

import process from 'node:process'

import {mdxToMd} from '@truenine/md-compiler'
import {ScopeError} from '@truenine/md-compiler/errors'
import {FilePathKind, PromptKind} from '@/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Input plugin for collecting rdm.mdx files from shadow project directories.
 * Scans dist/app/<project> directories for rdm.mdx files and collects them as ReadmePrompt objects.
 *
 * Supports both root README files (in project root) and child README files (in subdirectories).
 */
export class ReadmeMdInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ReadmeMdInputPlugin', ['ShadowProjectInputPlugin'])
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, fs, path, globalScope} = ctx
    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(options)

    const shadowProjectsDir = this.resolveShadowPath(options.shadowSourceProject.project.dist, shadowProjectDir)

    const readmePrompts: ReadmePrompt[] = []

    if (!fs.existsSync(shadowProjectsDir) || !fs.statSync(shadowProjectsDir).isDirectory()) { // Check if shadow projects directory exists
      logger.debug('shadow projects directory does not exist', {path: shadowProjectsDir})
      return {readmePrompts}
    }

    try {
      const projectEntries = fs.readdirSync(shadowProjectsDir, {withFileTypes: true}) // Scan dist/app/<project> directories

      for (const projectEntry of projectEntries) {
        if (!projectEntry.isDirectory()) continue

        const projectName = projectEntry.name
        const projectDir = path.join(shadowProjectsDir, projectName) // New structure: dist/app/<project>/ (no nested dist folder)

        await this.collectReadmeFiles( // Collect rdm.mdx files from project directory
          ctx,
          projectDir,
          projectName,
          workspaceDir,
          '',
          readmePrompts,
          globalScope
        )
      }
    }
    catch (e) {
      logger.error('failed to scan shadow projects', {path: shadowProjectsDir, error: e})
    }

    return {readmePrompts}
  }

  private async collectReadmeFiles(
    ctx: InputPluginContext,
    currentDir: string,
    projectName: string,
    workspaceDir: string,
    relativePath: string,
    readmePrompts: ReadmePrompt[],
    globalScope: InputPluginContext['globalScope']
  ): Promise<void> {
    const {fs, path, logger} = ctx
    const isRoot = relativePath === ''

    const readmePath = path.join(currentDir, 'rdm.mdx') // Check for rdm.mdx in current directory
    if (fs.existsSync(readmePath) && fs.statSync(readmePath).isFile()) {
      try {
        const rawContent = fs.readFileSync(readmePath, 'utf8')

        let content: string // Only compile if globalScope is provided, otherwise use raw content // Compile MDX with globalScope to evaluate expressions like {profile.name}
        if (globalScope != null) {
          try {
            content = await mdxToMd(rawContent, {globalScope, basePath: currentDir})
          }
          catch (e) {
            if (e instanceof ScopeError) {
              logger.error(`MDX compilation failed in ${readmePath}: ${e.message}`)
              logger.error(`Please check your configuration file (~/.aindex/.tnmsc.json) and ensure all required variables are defined.`)
              process.exit(1)
            }
            throw e
          }
        } else content = rawContent

        const targetPath = isRoot ? projectName : path.join(projectName, relativePath) // Calculate target directory

        const targetDir: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: targetPath,
          basePath: workspaceDir,
          getDirectoryName: () => isRoot ? projectName : path.basename(relativePath),
          getAbsolutePath: () => path.resolve(workspaceDir, targetPath)
        }

        const dir: RelativePath = { // Create dir for the README file location
          pathKind: FilePathKind.Relative,
          path: path.dirname(readmePath),
          basePath: workspaceDir,
          getDirectoryName: () => path.basename(path.dirname(readmePath)),
          getAbsolutePath: () => path.dirname(readmePath)
        }

        readmePrompts.push({
          type: PromptKind.Readme,
          content,
          length: content.length,
          filePathKind: FilePathKind.Relative,
          projectName,
          targetDir,
          isRoot,
          markdownContents: [], // Required by Prompt interface
          dir
        })
      }
      catch (e) {
        logger.warn('failed to read readme', {path: readmePath, error: e})
      }
    }

    try { // Scan subdirectories for child README files
      const entries = fs.readdirSync(currentDir, {withFileTypes: true})

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subRelativePath = isRoot ? entry.name : path.join(relativePath, entry.name)
          const subDir = path.join(currentDir, entry.name)

          await this.collectReadmeFiles(ctx, subDir, projectName, workspaceDir, subRelativePath, readmePrompts, globalScope)
        }
      }
    }
    catch (e) {
      logger.warn('failed to scan directory', {path: currentDir, error: e})
    }
  }
}
