import type {
  InputCollectedContext,
  InputPluginContext,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  YAMLFrontMatter
} from '../plugins/plugin-core'

import process from 'node:process'

import {mdxToMd} from '@truenine/md-compiler'
import {CompilerDiagnosticError, ScopeError} from '@truenine/md-compiler/errors'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {
  buildConfigDiagnostic,
  buildFileOperationDiagnostic,
  buildPromptCompilerDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {AbstractInputPlugin, FilePathKind, PromptKind} from '../plugins/plugin-core'
import {assertNoResidualModuleSyntax} from '../plugins/plugin-core/DistPromptGuards'
import {formatPromptCompilerDiagnostic} from '../plugins/plugin-core/PromptCompilerDiagnostics'

const PROJECT_MEMORY_FILE = 'agt.mdx'
const SCAN_SKIP_DIRECTORIES: readonly string[] = ['node_modules', '.git'] as const

export class ProjectPromptInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ProjectPromptInputPlugin', ['AindexInputPlugin'])
  }

  async collect(ctx: InputPluginContext): Promise<Partial<InputCollectedContext>> {
    const {dependencyContext, fs, userConfigOptions: options, path, globalScope} = ctx
    const {aindexDir} = this.resolveBasePaths(options)

    const shadowProjectsDir = this.resolveAindexPath(options.aindex.app.dist, aindexDir)

    const dependencyWorkspace = dependencyContext.workspace
    if (dependencyWorkspace == null) {
      this.log.info('No workspace found in dependency context, skipping project prompt enhancement')
      return {}
    }

    const projects = dependencyWorkspace.projects ?? []

    const enhancedProjects = await Promise.all(projects.map(async project => {
      const projectName = project.name
      if (projectName == null) return project

      const shadowProjectPath = path.join(shadowProjectsDir, projectName)
      if (!fs.existsSync(shadowProjectPath) || !fs.statSync(shadowProjectPath).isDirectory()) return project

      const targetProjectPath = project.dirFromWorkspacePath?.getAbsolutePath()

      const rootMemoryPrompt = await this.readRootMemoryPrompt(ctx, shadowProjectPath, globalScope)
      const childMemoryPrompts = targetProjectPath != null
        ? await this.scanChildMemoryPrompts(ctx, shadowProjectPath, targetProjectPath, globalScope)
        : []

      return {
        ...project,
        ...rootMemoryPrompt != null && {rootMemoryPrompt},
        ...childMemoryPrompts.length > 0 && {childMemoryPrompts}
      }
    }))

    return {
      workspace: {
        directory: dependencyWorkspace.directory,
        projects: enhancedProjects
      }
    }
  }

  private async readRootMemoryPrompt(
    ctx: InputPluginContext,
    projectPath: string,
    globalScope: InputPluginContext['globalScope']
  ): Promise<ProjectRootMemoryPrompt | undefined> {
    const {fs, path, logger} = ctx
    const filePath = path.join(projectPath, PROJECT_MEMORY_FILE)

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return

    try {
      const rawContent = fs.readFileSync(filePath, 'utf8')
      const parsed = parseMarkdown<YAMLFrontMatter>(rawContent)

      let content: string
      try {
        const {content: compiledContent} = await mdxToMd(rawContent, {
          globalScope,
          extractMetadata: true,
          basePath: projectPath,
          filePath
        })
        content = compiledContent
        assertNoResidualModuleSyntax(content, filePath)
      }
      catch (e) {
        if (e instanceof CompilerDiagnosticError) {
          logger.error(buildPromptCompilerDiagnostic({
            code: 'PROJECT_ROOT_MEMORY_PROMPT_COMPILE_FAILED',
            title: 'Failed to compile project root memory prompt',
            diagnosticText: formatPromptCompilerDiagnostic(e, {
              operation: 'Failed to compile project root memory prompt.',
              promptKind: 'project-root-memory',
              logicalName: filePath,
              distPath: filePath
            }),
            details: {
              promptKind: 'project-root-memory',
              distPath: filePath
            }
          }))
          if (e instanceof ScopeError) {
            logger.error(buildConfigDiagnostic({
              code: 'PROJECT_ROOT_MEMORY_SCOPE_VARIABLES_MISSING',
              title: 'Project root memory prompt references missing config variables',
              reason: diagnosticLines(
                'The project root memory prompt uses scope variables that are not defined in `~/.aindex/.tnmsc.json`.'
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

      return {
        type: PromptKind.ProjectRootMemory,
        content,
        length: content.length,
        filePathKind: FilePathKind.Relative,
        ...parsed.yamlFrontMatter != null && {yamlFrontMatter: parsed.yamlFrontMatter},
        ...parsed.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
        markdownAst: parsed.markdownAst,
        markdownContents: parsed.markdownContents,
        dir: {
          pathKind: FilePathKind.Root,
          path: '',
          getDirectoryName: () => ''
        }
      }
    }
    catch (e) {
      logger.error(buildFileOperationDiagnostic({
        code: 'PROJECT_ROOT_MEMORY_PROMPT_READ_FAILED',
        title: 'Failed to read project root memory prompt',
        operation: 'read',
        targetKind: 'project root memory prompt',
        path: filePath,
        error: e
      }))
      return void 0
    }
  }

  private async scanChildMemoryPrompts(
    ctx: InputPluginContext,
    shadowProjectPath: string,
    targetProjectPath: string,
    globalScope: InputPluginContext['globalScope']
  ): Promise<ProjectChildrenMemoryPrompt[]> {
    const {logger} = ctx
    const prompts: ProjectChildrenMemoryPrompt[] = []

    try {
      await this.scanDirectoryRecursive(ctx, shadowProjectPath, shadowProjectPath, targetProjectPath, prompts, globalScope)
    }
    catch (e) {
      logger.error(buildFileOperationDiagnostic({
        code: 'PROJECT_CHILD_MEMORY_SCAN_FAILED',
        title: 'Failed to scan project child memory prompts',
        operation: 'scan',
        targetKind: 'project child memory prompt directory',
        path: shadowProjectPath,
        error: e
      }))
    }

    return prompts
  }

  private async scanDirectoryRecursive(
    ctx: InputPluginContext,
    shadowProjectPath: string,
    currentPath: string,
    targetProjectPath: string,
    prompts: ProjectChildrenMemoryPrompt[],
    globalScope: InputPluginContext['globalScope']
  ): Promise<void> {
    const {fs, path} = ctx

    const entries = fs.readdirSync(currentPath, {withFileTypes: true})
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      if (SCAN_SKIP_DIRECTORIES.includes(entry.name)) continue

      const childDir = path.join(currentPath, entry.name)
      const memoryFile = path.join(childDir, PROJECT_MEMORY_FILE)

      if (Boolean(fs.existsSync(memoryFile)) && Boolean(fs.statSync(memoryFile).isFile())) {
        const prompt = await this.readChildMemoryPrompt(ctx, shadowProjectPath, childDir, targetProjectPath, globalScope)
        if (prompt != null) prompts.push(prompt)
      }

      await this.scanDirectoryRecursive(ctx, shadowProjectPath, childDir, targetProjectPath, prompts, globalScope)
    }
  }

  private async readChildMemoryPrompt(
    ctx: InputPluginContext,
    shadowProjectPath: string,
    shadowChildDir: string,
    targetProjectPath: string,
    globalScope: InputPluginContext['globalScope']
  ): Promise<ProjectChildrenMemoryPrompt | undefined> {
    const {fs, path, logger} = ctx
    const filePath = path.join(shadowChildDir, PROJECT_MEMORY_FILE)

    try {
      const rawContent = fs.readFileSync(filePath, 'utf8')
      const parsed = parseMarkdown<YAMLFrontMatter>(rawContent)

      let content: string
      try {
        const {content: compiledContent} = await mdxToMd(rawContent, {
          globalScope,
          extractMetadata: true,
          basePath: shadowChildDir,
          filePath
        })
        content = compiledContent
        assertNoResidualModuleSyntax(content, filePath)
      }
      catch (e) {
        if (e instanceof CompilerDiagnosticError) {
          logger.error(buildPromptCompilerDiagnostic({
            code: 'PROJECT_CHILD_MEMORY_PROMPT_COMPILE_FAILED',
            title: 'Failed to compile project child memory prompt',
            diagnosticText: formatPromptCompilerDiagnostic(e, {
              operation: 'Failed to compile project child memory prompt.',
              promptKind: 'project-child-memory',
              logicalName: filePath,
              distPath: filePath
            }),
            details: {
              promptKind: 'project-child-memory',
              distPath: filePath
            }
          }))
          if (e instanceof ScopeError) {
            logger.error(buildConfigDiagnostic({
              code: 'PROJECT_CHILD_MEMORY_SCOPE_VARIABLES_MISSING',
              title: 'Project child memory prompt references missing config variables',
              reason: diagnosticLines(
                'The project child memory prompt uses scope variables that are not defined in `~/.aindex/.tnmsc.json`.'
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

      const relativePath = path.relative(shadowProjectPath, shadowChildDir)
      const targetChildDir = path.join(targetProjectPath, relativePath)
      const dirName = path.basename(shadowChildDir)

      return {
        type: PromptKind.ProjectChildrenMemory,
        content,
        length: content.length,
        filePathKind: FilePathKind.Relative,
        ...parsed.yamlFrontMatter != null && {yamlFrontMatter: parsed.yamlFrontMatter},
        ...parsed.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
        markdownAst: parsed.markdownAst,
        markdownContents: parsed.markdownContents,
        dir: {
          pathKind: FilePathKind.Relative,
          path: relativePath,
          basePath: targetProjectPath,
          getDirectoryName: () => dirName,
          getAbsolutePath: () => targetChildDir
        },
        workingChildDirectoryPath: {
          pathKind: FilePathKind.Relative,
          path: relativePath,
          basePath: targetProjectPath,
          getDirectoryName: () => dirName,
          getAbsolutePath: () => targetChildDir
        }
      }
    }
    catch (e) {
      logger.error(buildFileOperationDiagnostic({
        code: 'PROJECT_CHILD_MEMORY_PROMPT_READ_FAILED',
        title: 'Failed to read project child memory prompt',
        operation: 'read',
        targetKind: 'project child memory prompt',
        path: filePath,
        error: e
      }))
      return void 0
    }
  }
}
