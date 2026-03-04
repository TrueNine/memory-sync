import type {
  InputCollectedContext,
  InputPluginContext,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  YAMLFrontMatter
} from '../plugins/plugin-core'

import process from 'node:process'

import {mdxToMd} from '@truenine/md-compiler'
import {ScopeError} from '@truenine/md-compiler/errors'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {AbstractInputPlugin, FilePathKind, PromptKind} from '../plugins/plugin-core'

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
      this.log.warn('No workspace found in dependency context, skipping project prompt enhancement')
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
        content = await mdxToMd(rawContent, {globalScope, basePath: projectPath})
      }
      catch (e) {
        if (e instanceof ScopeError) {
          logger.error(`MDX compilation failed in ${filePath}: ${e.message}`)
          logger.error(`Please check your configuration file (~/.aindex/.tnmsc.json) and ensure all required variables are defined.`)
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
      logger.error(`Failed to read root memory prompt at ${filePath}`, {error: e})
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
      logger.error(`Failed to scan child memory prompts at ${shadowProjectPath}`, {error: e})
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
        content = await mdxToMd(rawContent, {globalScope, basePath: shadowChildDir})
      }
      catch (e) {
        if (e instanceof ScopeError) {
          logger.error(`MDX compilation failed in ${filePath}: ${e.message}`)
          logger.error(`Please check your configuration file (~/.aindex/.tnmsc.json) and ensure all required variables are defined.`)
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
      logger.error(`Failed to read child memory prompt at ${filePath}`, {error: e})
      return void 0
    }
  }
}
