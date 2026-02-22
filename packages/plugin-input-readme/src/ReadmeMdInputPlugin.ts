import type {CollectedInputContext, InputPluginContext, ReadmePrompt, RelativePath} from '@truenine/plugin-shared'

import process from 'node:process'

import {mdxToMd} from '@truenine/md-compiler'
import {ScopeError} from '@truenine/md-compiler/errors'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {FilePathKind, PromptKind} from '@truenine/plugin-shared'

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

    if (!fs.existsSync(shadowProjectsDir) || !fs.statSync(shadowProjectsDir).isDirectory()) {
      logger.debug('shadow projects directory does not exist', {path: shadowProjectsDir})
      return {readmePrompts}
    }

    try {
      const projectEntries = fs.readdirSync(shadowProjectsDir, {withFileTypes: true})

      for (const projectEntry of projectEntries) {
        if (!projectEntry.isDirectory()) continue

        const projectName = projectEntry.name
        const projectDir = path.join(shadowProjectsDir, projectName)

        await this.collectReadmeFiles(
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

    const readmePath = path.join(currentDir, 'rdm.mdx')
    if (fs.existsSync(readmePath) && fs.statSync(readmePath).isFile()) {
      try {
        const rawContent = fs.readFileSync(readmePath, 'utf8')

        let content: string
        if (globalScope != null) {
          try {
            content = await mdxToMd(rawContent, {globalScope, basePath: currentDir})
          }
          catch (e) {
            if (e instanceof ScopeError) {
              logger.error(`MDX compilation failed in ${readmePath}: ${(e as Error).message}`)
              logger.error(`Please check your configuration file (~/.aindex/.tnmsc.json) and ensure all required variables are defined.`)
              process.exit(1)
            }
            throw e
          }
        } else content = rawContent

        const targetPath = isRoot ? projectName : path.join(projectName, relativePath)

        const targetDir: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: targetPath,
          basePath: workspaceDir,
          getDirectoryName: () => isRoot ? projectName : path.basename(relativePath),
          getAbsolutePath: () => path.resolve(workspaceDir, targetPath)
        }

        const dir: RelativePath = {
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
          markdownContents: [],
          dir
        })
      }
      catch (e) {
        logger.warn('failed to read readme', {path: readmePath, error: e})
      }
    }

    try {
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
