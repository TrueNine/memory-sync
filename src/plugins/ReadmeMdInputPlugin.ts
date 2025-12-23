import type { CollectedInputContext, InputPluginContext, ReadmePrompt, RelativePath } from '@/types'

import { DEFAULT_SHADOW_SOURCE_PROJECT_DIR } from '@/constants'
import { FilePathKind, PromptKind } from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Input plugin for collecting README.md files from shadow project directories.
 * Scans ref/star/dist directories for README.md files and collects them as ReadmePrompt objects.
 *
 * Supports both root README files (in dist/) and child README files (in dist/subdir/).
 */
export class ReadmeMdInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ReadmeMdInputPlugin', ['ShadowProjectInputPlugin'])
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger, fs, path } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const shadowSourceProjectDirRaw = options.shadowSourceProjectDir ?? DEFAULT_SHADOW_SOURCE_PROJECT_DIR
    const shadowSourceProjectDir = this.resolvePath(shadowSourceProjectDirRaw, workspaceDir, shadowProjectDir)

    const readmePrompts: ReadmePrompt[] = []

    // Check if shadow source project directory exists
    if (!fs.existsSync(shadowSourceProjectDir) || !fs.statSync(shadowSourceProjectDir).isDirectory()) {
      logger.debug('shadow source project directory does not exist', { path: shadowSourceProjectDir })
      return { readmePrompts }
    }

    try {
      // Scan ref/* directories
      const projectEntries = fs.readdirSync(shadowSourceProjectDir, { withFileTypes: true })

      for (const projectEntry of projectEntries) {
        if (!projectEntry.isDirectory()) {
          continue
        }

        const projectName = projectEntry.name
        const distDir = path.join(shadowSourceProjectDir, projectName, 'dist')

        // Check if dist directory exists
        if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
          continue
        }

        // Collect README.md files from dist directory
        this.collectReadmeFiles(
          ctx,
          distDir,
          projectName,
          workspaceDir,
          '',
          readmePrompts,
        )
      }
    } catch (e) {
      logger.error('failed to scan shadow source projects', { path: shadowSourceProjectDir, error: e })
    }

    return { readmePrompts }
  }

  /**
   * Recursively collect README.md files from a directory.
   *
   * @param ctx - Input plugin context
   * @param currentDir - Current directory to scan
   * @param projectName - Project name
   * @param workspaceDir - Workspace directory
   * @param relativePath - Relative path from dist directory
   * @param readmePrompts - Array to collect README prompts
   */
  private collectReadmeFiles(
    ctx: InputPluginContext,
    currentDir: string,
    projectName: string,
    workspaceDir: string,
    relativePath: string,
    readmePrompts: ReadmePrompt[],
  ): void {
    const { fs, path, logger } = ctx
    const isRoot = relativePath === ''

    // Check for README.md in current directory
    const readmePath = path.join(currentDir, 'README.md')
    if (fs.existsSync(readmePath) && fs.statSync(readmePath).isFile()) {
      try {
        const content = fs.readFileSync(readmePath, 'utf-8')

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
        logger.warn('failed to read README.md', { path: readmePath, error: e })
      }
    }

    // Scan subdirectories for child README files
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subRelativePath = isRoot ? entry.name : path.join(relativePath, entry.name)
          const subDir = path.join(currentDir, entry.name)

          this.collectReadmeFiles(
            ctx,
            subDir,
            projectName,
            workspaceDir,
            subRelativePath,
            readmePrompts,
          )
        }
      }
    } catch (e) {
      logger.warn('failed to scan directory', { path: currentDir, error: e })
    }
  }
}
