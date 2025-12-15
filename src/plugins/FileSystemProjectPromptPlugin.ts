import type { Logger } from '@/log'
import type {
  CollectedInputContext,
  InputPlugin,
  InputPluginContext,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  YAMLFrontMatter,
} from '@/types'

import { createLogger } from '@/log'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  PluginKind,
  PromptKind,
} from '@/types'


/**
 * Project memory prompt file name
 */
const PROJECT_MEMORY_FILE = 'AGENTS.md'

export class FileSystemProjectPromptPlugin implements InputPlugin {
  readonly type = PluginKind.Input
  readonly name = 'FileSystemProjectPromptPlugin'
  readonly log: Logger
  readonly dependsOn = ['FileSystemShadowProjectPlugin'] as const

  constructor() {
    this.log = createLogger(this.name)
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { dependencyContext, fs } = ctx

    // Get workspace from dependency context (provided by FileSystemShadowProjectPlugin)
    const dependencyWorkspace = dependencyContext.workspace
    if (dependencyWorkspace == null) {
      this.log.warn('No workspace found in dependency context, skipping project prompt enhancement')
      return {}
    }

    const projects = dependencyWorkspace.projects ?? []

    // Enhance projects with memory prompts
    const enhancedProjects = projects.map((project) => {
      const projectPath = project.dirFromWorkspacePath?.getAbsolutePath()
      if (projectPath == null) {
        return project
      }

      if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
        return project
      }

      const rootMemoryPrompt = this.readRootMemoryPrompt(ctx, projectPath)
      const childMemoryPrompts = this.scanChildMemoryPrompts(ctx, projectPath)

      return {
        ...project,
        ...(rootMemoryPrompt != null && { rootMemoryPrompt }),
        ...(childMemoryPrompts.length > 0 && { childMemoryPrompts }),
      }
    })

    // Return workspace with enhanced projects, preserving the original directory
    return {
      workspace: {
        directory: dependencyWorkspace.directory,
        projects: enhancedProjects,
      },
    }
  }

  private readRootMemoryPrompt(
    ctx: InputPluginContext,
    projectPath: string,
  ): ProjectRootMemoryPrompt | undefined {
    const { fs, path, logger } = ctx
    const filePath = path.join(projectPath, PROJECT_MEMORY_FILE)

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return
    }

    try {
      const rawContent = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseMarkdown<YAMLFrontMatter>(rawContent)
      const content = parsed.contentWithoutFrontMatter

      return {
        type: PromptKind.ProjectRootMemory,
        content,
        length: content.length,
        filePathKind: FilePathKind.Relative,
        ...(parsed.yamlFrontMatter != null && { yamlFrontMatter: parsed.yamlFrontMatter }),
        ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
        markdownAst: parsed.markdownAst,
        markdownContents: parsed.markdownContents,
        dir: {
          pathKind: FilePathKind.Empty,
          path: '',
          getDirectoryName: () => '',
        },
      }
    } catch (e) {
      logger.error(`Failed to read root memory prompt at ${filePath}`, { error: e })
      return void 0
    }
  }

  private scanChildMemoryPrompts(
    ctx: InputPluginContext,
    projectPath: string,
  ): ProjectChildrenMemoryPrompt[] {
    const { logger } = ctx
    const prompts: ProjectChildrenMemoryPrompt[] = []

    try {
      this.scanDirectoryRecursive(ctx, projectPath, projectPath, prompts)
    } catch (e) {
      logger.error(`Failed to scan child memory prompts at ${projectPath}`, { error: e })
    }

    return prompts
  }

  private scanDirectoryRecursive(
    ctx: InputPluginContext,
    projectPath: string,
    currentPath: string,
    prompts: ProjectChildrenMemoryPrompt[],
  ): void {
    const { fs, path } = ctx

    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!(Boolean(entry.isDirectory()))) {
        continue
      }

      // Skip hidden directories and common non-source directories
      if ((Boolean(entry.name.startsWith('.'))) || entry.name === 'node_modules') {
        continue
      }

      const childDir = path.join(currentPath, entry.name)
      const memoryFile = path.join(childDir, PROJECT_MEMORY_FILE)

      if ((Boolean(fs.existsSync(memoryFile))) && (Boolean(fs.statSync(memoryFile).isFile()))) {
        const prompt = this.readChildMemoryPrompt(ctx, projectPath, childDir, entry.name)
        if (prompt != null) {
          prompts.push(prompt)
        }
      }

      // Continue scanning subdirectories
      this.scanDirectoryRecursive(ctx, projectPath, childDir, prompts)
    }
  }

  private readChildMemoryPrompt(
    ctx: InputPluginContext,
    projectPath: string,
    childDir: string,
    dirName: string,
  ): ProjectChildrenMemoryPrompt | undefined {
    const { fs, path, logger } = ctx
    const filePath = path.join(childDir, PROJECT_MEMORY_FILE)

    try {
      const rawContent = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseMarkdown<YAMLFrontMatter>(rawContent)
      const content = parsed.contentWithoutFrontMatter
      const relativePath = path.relative(projectPath, childDir)

      return {
        type: PromptKind.ProjectChildrenMemory,
        content,
        length: content.length,
        filePathKind: FilePathKind.Relative,
        ...(parsed.yamlFrontMatter != null && { yamlFrontMatter: parsed.yamlFrontMatter }),
        ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
        markdownAst: parsed.markdownAst,
        markdownContents: parsed.markdownContents,
        dir: {
          pathKind: FilePathKind.Relative,
          path: relativePath,
          basePath: projectPath,
          getDirectoryName: () => dirName,
          getAbsolutePath: () => childDir,
        },
        workingChildDirectoryPath: {
          pathKind: FilePathKind.Relative,
          path: relativePath,
          basePath: projectPath,
          getDirectoryName: () => dirName,
          getAbsolutePath: () => childDir,
        },
      }
    } catch (e) {
      logger.error(`Failed to read child memory prompt at ${filePath}`, { error: e })
      return void 0
    }
  }
}
