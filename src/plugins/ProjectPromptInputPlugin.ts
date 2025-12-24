import type {
  CollectedInputContext,
  InputPluginContext,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  YAMLFrontMatter,
} from '@/types'

import { DEFAULT_SHADOW_PROJECTS_DIR } from '@/constants'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  PromptKind,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Project memory prompt file name
 */
const PROJECT_MEMORY_FILE = 'AGENTS.md'

export class ProjectPromptInputPlugin extends AbstractInputPlugin {
  constructor() {
    // Updated dependency name
    super('ProjectPromptInputPlugin', ['ShadowProjectInputPlugin'])
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { dependencyContext, fs, userConfigOptions: options, path } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    // Resolve shadow projects directory
    const shadowProjectsDirRaw = options.shadowProjectsDir ?? DEFAULT_SHADOW_PROJECTS_DIR
    const shadowProjectsDir = this.resolvePath(shadowProjectsDirRaw, workspaceDir, shadowProjectDir)

    // Get workspace from dependency context (provided by ShadowProjectInputPlugin)
    const dependencyWorkspace = dependencyContext.workspace
    if (dependencyWorkspace == null) {
      this.log.warn('No workspace found in dependency context, skipping project prompt enhancement')
      return {}
    }

    const projects = dependencyWorkspace.projects ?? []

    // Enhance projects with memory prompts from shadow projects directory
    // New structure: dist/app/<project>/AGENTS.md (no nested dist folder)
    const enhancedProjects = projects.map((project) => {
      const projectName = project.name
      if (projectName == null) {
        return project
      }

      // Read directly from shadow projects directory: dist/app/<project>/
      const shadowProjectPath = path.join(shadowProjectsDir, projectName)
      if (!fs.existsSync(shadowProjectPath) || !fs.statSync(shadowProjectPath).isDirectory()) {
        return project
      }

      // Get target project path for output
      const targetProjectPath = project.dirFromWorkspacePath?.getAbsolutePath()

      // Root prompt: dist/app/<project>/AGENTS.md -> <project>/AGENTS.md
      const rootMemoryPrompt = this.readRootMemoryPrompt(ctx, shadowProjectPath)
      // Child prompts: dist/app/<project>/<subdir>/AGENTS.md -> <project>/<subdir>/AGENTS.md
      const childMemoryPrompts = targetProjectPath != null
        ? this.scanChildMemoryPrompts(ctx, shadowProjectPath, targetProjectPath)
        : []

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
          pathKind: FilePathKind.Root,
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
    shadowProjectPath: string,
    targetProjectPath: string,
  ): ProjectChildrenMemoryPrompt[] {
    const { logger } = ctx
    const prompts: ProjectChildrenMemoryPrompt[] = []

    try {
      this.scanDirectoryRecursive(ctx, shadowProjectPath, shadowProjectPath, targetProjectPath, prompts)
    } catch (e) {
      logger.error(`Failed to scan child memory prompts at ${shadowProjectPath}`, { error: e })
    }

    return prompts
  }

  private scanDirectoryRecursive(
    ctx: InputPluginContext,
    shadowProjectPath: string,
    currentPath: string,
    targetProjectPath: string,
    prompts: ProjectChildrenMemoryPrompt[],
  ): void {
    const { fs, path } = ctx

    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!(entry.isDirectory())) {
        continue
      }

      // Skip hidden directories and common non-source directories
      if ((Boolean(entry.name.startsWith('.'))) || entry.name === 'node_modules') {
        continue
      }

      const childDir = path.join(currentPath, entry.name)
      const memoryFile = path.join(childDir, PROJECT_MEMORY_FILE)

      if ((Boolean(fs.existsSync(memoryFile))) && (Boolean(fs.statSync(memoryFile).isFile()))) {
        const prompt = this.readChildMemoryPrompt(ctx, shadowProjectPath, childDir, targetProjectPath)
        if (prompt != null) {
          prompts.push(prompt)
        }
      }

      // Continue scanning subdirectories
      this.scanDirectoryRecursive(ctx, shadowProjectPath, childDir, targetProjectPath, prompts)
    }
  }

  private readChildMemoryPrompt(
    ctx: InputPluginContext,
    shadowProjectPath: string,
    shadowChildDir: string,
    targetProjectPath: string,
  ): ProjectChildrenMemoryPrompt | undefined {
    const { fs, path, logger } = ctx
    const filePath = path.join(shadowChildDir, PROJECT_MEMORY_FILE)

    try {
      const rawContent = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseMarkdown<YAMLFrontMatter>(rawContent)
      const content = parsed.contentWithoutFrontMatter
      // Relative path from shadow project root
      const relativePath = path.relative(shadowProjectPath, shadowChildDir)
      // Target directory in actual project
      const targetChildDir = path.join(targetProjectPath, relativePath)
      const dirName = path.basename(shadowChildDir)

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
    } catch (e) {
      logger.error(`Failed to read child memory prompt at ${filePath}`, { error: e })
      return void 0
    }
  }
}
