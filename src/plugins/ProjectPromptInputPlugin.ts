import type {
  CollectedInputContext,
  InputPluginContext,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  YAMLFrontMatter,
} from '@/types'

import process from 'node:process'

import {mdxToMd} from '@/compiler'
import {parseMarkdown} from '@/markdown'
import {
  FilePathKind,
  PromptKind,
} from '@/types'
import {ScopeError} from '@/types/Errors'
import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Project memory prompt file name
 */
const PROJECT_MEMORY_FILE = 'agt.mdx'

export class ProjectPromptInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ProjectPromptInputPlugin', ['ShadowProjectInputPlugin']) // Updated dependency name
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {dependencyContext, fs, userConfigOptions: options, path, globalScope} = ctx
    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(options)

    const shadowProjectsDirRaw = options.shadowProjectsDir // Resolve shadow projects directory
    const shadowProjectsDir = this.resolvePath(shadowProjectsDirRaw, workspaceDir, shadowProjectDir)

    const dependencyWorkspace = dependencyContext.workspace // Get workspace from dependency context (provided by ShadowProjectInputPlugin)
    if (dependencyWorkspace == null) {
      this.log.warn('No workspace found in dependency context, skipping project prompt enhancement')
      return {}
    }

    const projects = dependencyWorkspace.projects ?? []

    const enhancedProjects = await Promise.all(projects.map(async project => { // New structure: dist/app/<project>/agt.mdx (no nested dist folder) // Enhance projects with memory prompts from shadow projects directory
      const projectName = project.name
      if (projectName == null) return project

      const shadowProjectPath = path.join(shadowProjectsDir, projectName) // Read directly from shadow projects directory: dist/app/<project>/
      if (!fs.existsSync(shadowProjectPath) || !fs.statSync(shadowProjectPath).isDirectory()) return project

      const targetProjectPath = project.dirFromWorkspacePath?.getAbsolutePath() // Get target project path for output

      const rootMemoryPrompt = await this.readRootMemoryPrompt(ctx, shadowProjectPath, globalScope) // Root prompt: dist/app/<project>/agt.mdx -> <project>/AGENTS.md
      const childMemoryPrompts = targetProjectPath != null // Child prompts: dist/app/<project>/<subdir>/agt.mdx -> <project>/<subdir>/AGENTS.md
        ? await this.scanChildMemoryPrompts(ctx, shadowProjectPath, targetProjectPath, globalScope)
        : []

      return {
        ...project,
        ...rootMemoryPrompt != null && {rootMemoryPrompt},
        ...childMemoryPrompts.length > 0 && {childMemoryPrompts},
      }
    }))

    return { // Return workspace with enhanced projects, preserving the original directory
      workspace: {
        directory: dependencyWorkspace.directory,
        projects: enhancedProjects,
      },
    }
  }

  private async readRootMemoryPrompt(
    ctx: InputPluginContext,
    projectPath: string,
    globalScope: InputPluginContext['globalScope'],
  ): Promise<ProjectRootMemoryPrompt | undefined> {
    const {fs, path, logger} = ctx
    const filePath = path.join(projectPath, PROJECT_MEMORY_FILE)

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return

    try {
      const rawContent = fs.readFileSync(filePath, 'utf8')
      const parsed = parseMarkdown<YAMLFrontMatter>(rawContent)

      let content: string // Compile MDX with globalScope to evaluate expressions like {profile.name}
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
          getDirectoryName: () => '',
        },
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
    globalScope: InputPluginContext['globalScope'],
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
    globalScope: InputPluginContext['globalScope'],
  ): Promise<void> {
    const {fs, path} = ctx

    const entries = fs.readdirSync(currentPath, {withFileTypes: true})
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      if (Boolean(entry.name.startsWith('.')) || entry.name === 'node_modules') continue // Skip hidden directories and common non-source directories

      const childDir = path.join(currentPath, entry.name)
      const memoryFile = path.join(childDir, PROJECT_MEMORY_FILE)

      if (Boolean(fs.existsSync(memoryFile)) && Boolean(fs.statSync(memoryFile).isFile())) {
        const prompt = await this.readChildMemoryPrompt(ctx, shadowProjectPath, childDir, targetProjectPath, globalScope)
        if (prompt != null) prompts.push(prompt)
      }

      await this.scanDirectoryRecursive(ctx, shadowProjectPath, childDir, targetProjectPath, prompts, globalScope) // Continue scanning subdirectories
    }
  }

  private async readChildMemoryPrompt(
    ctx: InputPluginContext,
    shadowProjectPath: string,
    shadowChildDir: string,
    targetProjectPath: string,
    globalScope: InputPluginContext['globalScope'],
  ): Promise<ProjectChildrenMemoryPrompt | undefined> {
    const {fs, path, logger} = ctx
    const filePath = path.join(shadowChildDir, PROJECT_MEMORY_FILE)

    try {
      const rawContent = fs.readFileSync(filePath, 'utf8')
      const parsed = parseMarkdown<YAMLFrontMatter>(rawContent)

      let content: string // Compile MDX with globalScope to evaluate expressions like {profile.name}
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

      const relativePath = path.relative(shadowProjectPath, shadowChildDir) // Relative path from shadow project root
      const targetChildDir = path.join(targetProjectPath, relativePath) // Target directory in actual project
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
          getAbsolutePath: () => targetChildDir,
        },
        workingChildDirectoryPath: {
          pathKind: FilePathKind.Relative,
          path: relativePath,
          basePath: targetProjectPath,
          getDirectoryName: () => dirName,
          getAbsolutePath: () => targetChildDir,
        },
      }
    }
    catch (e) {
      logger.error(`Failed to read child memory prompt at ${filePath}`, {error: e})
      return void 0
    }
  }
}
