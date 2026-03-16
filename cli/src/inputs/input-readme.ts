import type {InputCollectedContext, InputPluginContext, ReadmeFileKind, ReadmePrompt, RelativePath} from '../plugins/plugin-core'

import process from 'node:process'

import {mdxToMd} from '@truenine/md-compiler'
import {CompilerDiagnosticError, ScopeError} from '@truenine/md-compiler/errors'
import {
  buildConfigDiagnostic,
  buildFileOperationDiagnostic,
  buildPromptCompilerDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {AbstractInputPlugin, FilePathKind, PromptKind, README_FILE_KIND_MAP} from '../plugins/plugin-core'
import {assertNoResidualModuleSyntax} from '../plugins/plugin-core/DistPromptGuards'
import {formatPromptCompilerDiagnostic} from '../plugins/plugin-core/PromptCompilerDiagnostics'

const ALL_FILE_KINDS = Object.entries(README_FILE_KIND_MAP) as [ReadmeFileKind, {src: string, out: string}][]

export class ReadmeMdInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ReadmeMdInputPlugin', ['AindexInputPlugin'])
  }

  async collect(ctx: InputPluginContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, fs, path, globalScope} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(options)

    const aindexProjectsDir = this.resolveAindexPath(options.aindex.app.dist, aindexDir)

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
      logger.error(buildFileOperationDiagnostic({
        code: 'README_PROJECT_SCAN_FAILED',
        title: 'Failed to scan aindex projects for readme prompts',
        operation: 'scan',
        targetKind: 'aindex project directory',
        path: aindexProjectsDir,
        error: e
      }))
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
        try {
          const {content: compiledContent} = await mdxToMd(rawContent, {
            ...globalScope != null && {globalScope},
            extractMetadata: true,
            basePath: currentDir,
            filePath
          })
          content = compiledContent
          assertNoResidualModuleSyntax(content, filePath)
        }
        catch (e) {
          if (e instanceof CompilerDiagnosticError) {
            logger.error(buildPromptCompilerDiagnostic({
              code: 'README_PROMPT_COMPILE_FAILED',
              title: 'Failed to compile readme-family prompt',
              diagnosticText: formatPromptCompilerDiagnostic(e, {
                operation: 'Failed to compile readme-family prompt.',
                promptKind: 'readme-family',
                logicalName: `${projectName}/${src}`,
                distPath: filePath
              }),
              details: {
                promptKind: 'readme-family',
                distPath: filePath,
                projectName,
                fileKind
              }
            }))
            if (e instanceof ScopeError) {
              logger.error(buildConfigDiagnostic({
                code: 'README_SCOPE_VARIABLES_MISSING',
                title: 'Readme-family prompt references missing config variables',
                reason: diagnosticLines(
                  'The readme-family prompt uses scope variables that are not defined in `~/.aindex/.tnmsc.json`.'
                ),
                configPath: '~/.aindex/.tnmsc.json',
                exactFix: diagnosticLines(
                  'Define the missing variables in `~/.aindex/.tnmsc.json` and rerun tnmsc.'
                ),
                details: {
                  promptPath: filePath,
                  errorMessage: e.message
                }
              }))
            }
            process.exit(1)
          }
          throw e
        }

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
        logger.warn(buildFileOperationDiagnostic({
          code: 'README_PROMPT_READ_FAILED',
          title: 'Failed to read readme-family file',
          operation: 'read',
          targetKind: 'readme-family prompt file',
          path: filePath,
          error: e,
          details: {
            fileKind
          }
        }))
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
      logger.warn(buildFileOperationDiagnostic({
        code: 'README_DIRECTORY_SCAN_FAILED',
        title: 'Failed to scan readme-family directory',
        operation: 'scan',
        targetKind: 'readme-family directory',
        path: currentDir,
        error: e
      }))
    }
  }
}
