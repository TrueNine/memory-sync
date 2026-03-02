import type {CollectedInputContext, InputPluginContext, ReadmeFileKind, ReadmePrompt, RelativePath} from '@truenine/plugin-shared'

import process from 'node:process'

import {mdxToMd} from '@truenine/md-compiler'
import {ScopeError} from '@truenine/md-compiler/errors'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {FilePathKind, PromptKind, README_FILE_KIND_MAP} from '@truenine/plugin-shared'

const ALL_FILE_KINDS = Object.entries(README_FILE_KIND_MAP) as [ReadmeFileKind, {src: string, out: string}][]

export class ReadmeMdInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ReadmeMdInputPlugin', ['ShadowProjectInputPlugin'])
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, fs, path, globalScope} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(options)

    const aindexProjectsDir = this.resolveAindexPath(options.aindex.project.dist, aindexDir)

    const readmePrompts: ReadmePrompt[] = []

    if (!fs.existsSync(aindexProjectsDir) || !fs.statSync(aindexProjectsDir).isDirectory()) {
      logger.debug('aindex projects directory does not exist', {path: aindexProjectsDir})
      return {readmePrompts}
    }

    try {
      const projectEntries = fs.readdirSync(aindexProjectsDir, {withFileTypes: true})

      for (const projectEntry of projectEntries) {
        if (!projectEntry.isDirectory()) continue

        const projectName = projectEntry.name
        const projectDir = path.join(aindexProjectsDir, projectName)

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
      logger.error('failed to scan aindex projects', {path: aindexProjectsDir, error: e})
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

    for (const [fileKind, {src}] of ALL_FILE_KINDS) {
      const filePath = path.join(currentDir, src)
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue

      try {
        const rawContent = fs.readFileSync(filePath, 'utf8')

        let content: string
        if (globalScope != null) {
          try {
            content = await mdxToMd(rawContent, {globalScope, basePath: currentDir})
          }
          catch (e) {
            if (e instanceof ScopeError) {
              logger.error(`MDX compilation failed in ${filePath}: ${(e as Error).message}`)
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
          path: path.dirname(filePath),
          basePath: workspaceDir,
          getDirectoryName: () => path.basename(path.dirname(filePath)),
          getAbsolutePath: () => path.dirname(filePath)
        }

        readmePrompts.push({
          type: PromptKind.Readme,
          content,
          length: content.length,
          filePathKind: FilePathKind.Relative,
          projectName,
          targetDir,
          isRoot,
          fileKind,
          markdownContents: [],
          dir
        })
      }
      catch (e) {
        logger.warn('failed to read readme-family file', {path: filePath, fileKind, error: e})
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
