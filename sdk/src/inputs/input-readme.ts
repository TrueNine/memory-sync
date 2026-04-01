import type {InputCapabilityContext, InputCollectedContext, ReadmeFileKind, ReadmePrompt, RelativePath} from '../plugins/plugin-core'

import process from 'node:process'

import {CompilerDiagnosticError, ScopeError} from '@truenine/md-compiler/errors'
import {
  collectAindexProjectSeriesProjectNameConflicts,
  resolveAindexProjectSeriesConfigs
} from '@/aindex-project-series'
import {getGlobalConfigPath} from '@/ConfigLoader'
import {
  buildConfigDiagnostic,
  buildFileOperationDiagnostic,
  buildPromptCompilerDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {AbstractInputCapability, FilePathKind, PromptKind, README_FILE_KIND_MAP} from '../plugins/plugin-core'
import {assertNoResidualModuleSyntax} from '../plugins/plugin-core/DistPromptGuards'
import {readPromptArtifact} from '../plugins/plugin-core/PromptArtifactCache'
import {formatPromptCompilerDiagnostic} from '../plugins/plugin-core/PromptCompilerDiagnostics'

const ALL_FILE_KINDS = Object.entries(README_FILE_KIND_MAP) as [ReadmeFileKind, {src: string, out: string}][]

export class ReadmeMdInputCapability extends AbstractInputCapability {
  constructor() {
    super('ReadmeMdInputCapability', ['AindexInputCapability'])
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, fs, path, globalScope} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(options)
    const readmePrompts: ReadmePrompt[] = []
    const projectSeries = resolveAindexProjectSeriesConfigs(options)
    const projectRefs = projectSeries.flatMap(series => {
      const seriesSourceDir = this.resolveAindexPath(series.src, aindexDir)
      if (!(fs.existsSync(seriesSourceDir) && fs.statSync(seriesSourceDir).isDirectory())) return []

      return fs
        .readdirSync(seriesSourceDir, {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => ({
          projectName: entry.name,
          seriesName: series.name,
          seriesDir: path.join(seriesSourceDir, entry.name)
        }))
    })
    const conflicts = collectAindexProjectSeriesProjectNameConflicts(projectRefs)
    if (conflicts.length > 0) {
      logger.error(buildConfigDiagnostic({
        code: 'README_PROJECT_SERIES_NAME_CONFLICT',
        title: 'Readme project names must be unique across app, ext, arch, and softwares',
        reason: diagnosticLines(
          'Readme-family outputs target bare workspace project directories, so app/ext/arch/softwares cannot reuse the same project directory name.',
          `Conflicting project names: ${conflicts.map(conflict => conflict.projectName).join(', ')}`
        ),
        exactFix: diagnosticLines(
          'Rename the conflicting project directory in one of the app/ext/arch/softwares source trees and rerun tnmsc.'
        ),
        possibleFixes: conflicts.map(conflict => diagnosticLines(
          `"${conflict.projectName}" is currently declared in: ${conflict.refs.map(ref => `${ref.seriesName} (${ref.seriesDir})`).join(', ')}`
        )),
        details: {
          aindexDir,
          conflicts: conflicts.map(conflict => ({
            projectName: conflict.projectName,
            refs: conflict.refs.map(ref => ({
              seriesName: ref.seriesName,
              seriesDir: ref.seriesDir
            }))
          }))
        }
      }))

      throw new Error('Readme project series name conflict')
    }

    await Promise.all(projectSeries.map(async series => {
      const aindexProjectsDir = this.resolveAindexPath(series.dist, aindexDir)
      if (!(fs.existsSync(aindexProjectsDir) && fs.statSync(aindexProjectsDir).isDirectory())) {
        logger.debug('aindex project series directory does not exist', {path: aindexProjectsDir, series: series.name})
        return
      }

      try {
        const projectEntries = fs
          .readdirSync(aindexProjectsDir, {withFileTypes: true})
          .filter(entry => entry.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name))

        for (const projectEntry of projectEntries) {
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
          title: `Failed to scan aindex ${series.name} projects for readme prompts`,
          operation: 'scan',
          targetKind: `aindex ${series.name} project directory`,
          path: aindexProjectsDir,
          error: e
        }))
      }
    }))

    readmePrompts.sort((a, b) => {
      const projectDiff = a.projectName.localeCompare(b.projectName)
      if (projectDiff !== 0) return projectDiff

      const targetDiff = a.targetDir.path.localeCompare(b.targetDir.path)
      if (targetDiff !== 0) return targetDiff

      return a.fileKind.localeCompare(b.fileKind)
    })

    return {readmePrompts}
  }

  private async collectReadmeFiles(
    ctx: InputCapabilityContext,
    currentDir: string,
    projectName: string,
    workspaceDir: string,
    relativePath: string,
    readmePrompts: ReadmePrompt[],
    globalScope: InputCapabilityContext['globalScope']
  ): Promise<void> {
    const {fs, path, logger} = ctx
    const isRoot = relativePath === ''

    for (const [fileKind, {src}] of ALL_FILE_KINDS) {
      const filePath = path.join(currentDir, src)
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue

      try {
        let content: string
        try {
          const artifact = await readPromptArtifact(filePath, {
            mode: 'dist',
            globalScope
          })
          const {content: compiledContent} = artifact
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
              const globalConfigPath = getGlobalConfigPath()
              logger.error(buildConfigDiagnostic({
                code: 'README_SCOPE_VARIABLES_MISSING',
                title: 'Readme-family prompt references missing config variables',
                reason: diagnosticLines(
                  `The readme-family prompt uses scope variables that are not defined in "${globalConfigPath}".`
                ),
                configPath: globalConfigPath,
                exactFix: diagnosticLines(
                  `Define the missing variables in "${globalConfigPath}" and rerun tnmsc.`
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

        // Readme-family outputs intentionally land in <workspace>/<projectName>.
        // Cross-series duplicate project names are rejected earlier to keep this
        // workspace mapping deterministic and overwrite-free.
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
