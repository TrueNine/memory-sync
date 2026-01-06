import type { CollectedInputContext, InputPluginContext, ReadmePrompt, RelativePath } from '@/types'

import process from 'node:process'

import { mdxToMd } from '@/compiler'
import { FilePathKind, PromptKind } from '@/types'
import { ScopeError } from '@/types/Errors'
import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Input plugin for collecting readme.mdx files from shadow project directories.
 * Scans dist/app/<project> directories for readme.mdx files and collects them as ReadmePrompt objects.
 *
 * Supports both root README files (in project root) and child README files (in subdirectories).
 */
export class ReadmeMdInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ReadmeMdInputPlugin', ['ShadowProjectInputPlugin'])
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const { userConfigOptions: options, logger, fs, path, globalScope } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const shadowProjectsDirRaw = options.shadowProjectsDir
    const shadowProjectsDir = this.resolvePath(shadowProjectsDirRaw, workspaceDir, shadowProjectDir)

    const readmePrompts: ReadmePrompt[] = []

    // Check if shadow projects directory exists
    if (!fs.existsSync(shadowProjectsDir) || !fs.statSync(shadowProjectsDir).isDirectory()) {
      logger.debug('shadow projects directory does not exist', { path: shadowProjectsDir })
      return { readmePrompts }
    }

    try {
      // Scan dist/app/<project> directories
      const projectEntries = fs.readdirSync(shadowProjectsDir, { withFileTypes: true })

      for (const projectEntry of projectEntries) {
        if (!projectEntry.isDirectory()) continue

        const projectName = projectEntry.name
        // New structure: dist/app/<project>/ (no nested dist folder)
        const projectDir = path.join(shadowProjectsDir, projectName)

        // Collect readme.mdx files from project directory
        await this.collectReadmeFiles(
          ctx,
          projectDir,
          projectName,
          workspaceDir,
          '',
          readmePrompts,
          globalScope,
        )
      }
    } catch (e) {
      logger.error('failed to scan shadow projects', { path: shadowProjectsDir, error: e })
    }

    return { readmePrompts }
  }

  /**
   * Recursively collect readme.mdx files from a directory.
   *
   * @param ctx - Input plugin context
   * @param currentDir - Current directory to scan
   * @param projectName - Project name
   * @param workspaceDir - Workspace directory
   * @param relativePath - Relative path from dist directory
   * @param readmePrompts - Array to collect README prompts
   * @param globalScope - Global scope for MDX expression evaluation
   */
  private async collectReadmeFiles(
    ctx: InputPluginContext,
    currentDir: string,
    projectName: string,
    workspaceDir: string,
    relativePath: string,
    readmePrompts: ReadmePrompt[],
    globalScope: InputPluginContext['globalScope'],
  ): Promise<void> {
    const { fs, path, logger } = ctx
    const isRoot = relativePath === ''

    // Check for readme.mdx in current directory
    const readmePath = path.join(currentDir, 'readme.mdx')
    if (fs.existsSync(readmePath) && fs.statSync(readmePath).isFile()) {
      try {
        const rawContent = fs.readFileSync(readmePath, 'utf-8')

        // Compile MDX with globalScope to evaluate expressions like {profile.name}
        // Only compile if globalScope is provided, otherwise use raw content
        let content: string
        if (globalScope != null) {
          try {
            content = await mdxToMd(rawContent, {
              globalScope,
              basePath: currentDir,
            })
          } catch (e) {
            if (e instanceof ScopeError) {
              logger.error(`MDX compilation failed in ${readmePath}: ${e.message}`)
              logger.error(`Please check your configuration file (~/.aindex/.tnmsc.json) and ensure all required variables are defined.`)
              process.exit(1)
            }
            throw e
          }
        }
        else content = rawContent

        // Calculate target directory
        const targetPath = isRoot ? projectName : path.join(projectName, relativePath)

        const targetDir: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: targetPath,
          basePath: workspaceDir,
          getDirectoryName: () => isRoot ? projectName : path.basename(relativePath),
          getAbsolutePath: () => path.resolve(workspaceDir, targetPath),
        }

        // Create dir for the README file location
        const dir: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: path.dirname(readmePath),
          basePath: workspaceDir,
          getDirectoryName: () => path.basename(path.dirname(readmePath)),
          getAbsolutePath: () => path.dirname(readmePath),
        }

        readmePrompts.push({
          type: PromptKind.Readme,
          content,
          length: content.length,
          filePathKind: FilePathKind.Relative,
          projectName,
          targetDir,
          isRoot,
          // Required by Prompt interface
          markdownContents: [],
          dir,
        })
      } catch (e) {
        logger.warn('failed to read readme', { path: readmePath, error: e })
      }
    }

    // Scan subdirectories for child README files
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subRelativePath = isRoot ? entry.name : path.join(relativePath, entry.name)
          const subDir = path.join(currentDir, entry.name)

          await this.collectReadmeFiles(
            ctx,
            subDir,
            projectName,
            workspaceDir,
            subRelativePath,
            readmePrompts,
            globalScope,
          )
        }
      }
    } catch (e) {
      logger.warn('failed to scan directory', { path: currentDir, error: e })
    }
  }
}
