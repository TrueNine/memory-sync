/**
 * Kiro CLI Output Plugin
 *
 * Kiro Steering Front Matter Format:
 * Steering files are located in `.kiro/steering/*.md`
 *
 * @example Always included (default behavior)
 * ```yaml
 * ---
 * # No front matter needed, or empty front matter
 * ---
 * ```
 *
 * @example Conditionally included when a matching file is read into context
 * ```yaml
 * ---
 * inclusion: fileMatch
 * fileMatchPattern: 'README*'
 * ---
 * ```
 *
 * @example Manually included via context key ('#' in chat)
 * ```yaml
 * ---
 * inclusion: manual
 * ---
 * ```
 *
 * Supported front matter properties:
 * - `inclusion`: 'always' | 'fileMatch' | 'manual' (default: 'always')
 * - `fileMatchPattern`: glob pattern for fileMatch inclusion (e.g. '*.ts', 'src/**')
 */
import type {
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  WriteResult,
  WriteResults,
  YAMLFrontMatter,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import { FilePathKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.kiro'
const STEERING_SUBDIR = 'steering'

/**
 * Kiro steering file front matter
 * @see https://kiro.dev/docs/steering
 */
export interface KiroSteeringYAMLFrontMatter extends YAMLFrontMatter {
  /**
   * Inclusion mode for steering file
   * - 'always': Always included (default)
   * - 'fileMatch': Conditionally included when matching file is read
   * - 'manual': Manually included via context key ('#' in chat)
   */
  readonly inclusion?: 'always' | 'fileMatch' | 'manual'
  /**
   * Glob pattern for fileMatch inclusion mode
   * @example 'README*', '*.ts', 'src/**'
   */
  readonly fileMatchPattern?: string
}

// Kiro supports AGENTS.md at project root, so it relies on AGENTS.md output.
// Therefore, rootMemoryPrompt handling is not needed here.
export class KiroCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('KiroCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
    })
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      // Register <project>/.kiro/steering/ for cleanup
      const steeringDir = this.joinPath(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
      results.push({
        pathKind: FilePathKind.Relative,
        path: steeringDir,
        basePath: project.dirFromWorkspacePath.basePath,
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => this.joinPath(project.dirFromWorkspacePath!.basePath, steeringDir),
      })
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      // Register steering files for each childMemoryPrompt
      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildSteeringFileName(child)
          const filePath = this.joinPath(
            project.dirFromWorkspacePath.path,
            GLOBAL_CONFIG_DIR,
            STEERING_SUBDIR,
            fileName,
          )
          results.push({
            pathKind: FilePathKind.Relative,
            path: filePath,
            basePath: project.dirFromWorkspacePath.basePath,
            getDirectoryName: () => STEERING_SUBDIR,
            getAbsolutePath: () => this.joinPath(project.dirFromWorkspacePath!.basePath, filePath),
          })
        }
      }
    }

    return results
  }

  async registerGlobalOutputDirs(_ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalSteeringDir()
    return [
      {
        pathKind: FilePathKind.Relative,
        path: STEERING_SUBDIR,
        basePath: this.joinPath(this.getGlobalConfigDir()),
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => globalDir,
      },
    ]
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const { globalMemory } = ctx.collectedInputContext
    if (globalMemory == null) {
      return []
    }

    const globalDir = this.getGlobalSteeringDir()
    return [
      {
        pathKind: FilePathKind.Relative,
        path: GLOBAL_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => this.joinPath(globalDir, GLOBAL_MEMORY_FILE),
      },
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { workspace, globalMemory } = ctx.collectedInputContext
    const hasChildPrompts = workspace.projects.some(
      (p) => (p.childMemoryPrompts?.length ?? 0) > 0,
    )
    const hasGlobalMemory = globalMemory != null

    if (!hasChildPrompts && !hasGlobalMemory) {
      this.log.info('No outputs to write, skipping')
      return false
    }

    return true
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { projects } = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      // Skip shadow source project
      if (project.isShadowSourceProject === true) {
        this.log.debug(`Skipping shadow source project: ${project.name}`)
        continue
      }

      // Write childMemoryPrompts as steering files
      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const result = await this.writeSteeringFile(ctx, project, child)
          fileResults.push(result)
        }
      }
    }

    return { files: fileResults, dirs: dirResults }
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { globalMemory } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory == null) {
      this.log.info('No global memory found, skipping global output')
      return { files: fileResults, dirs: dirResults }
    }

    const globalDir = this.getGlobalSteeringDir()
    const fullPath = this.joinPath(globalDir, GLOBAL_MEMORY_FILE)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: GLOBAL_MEMORY_FILE,
      basePath: globalDir,
      getDirectoryName: () => STEERING_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.info(`[DRY-RUN] Would write global memory -> ${fullPath}`)
      return {
        files: [{ path: relativePath, success: true, skipped: false }],
        dirs: dirResults,
      }
    }

    try {
      this.ensureDirectory(globalDir)
      this.writeFileSync(fullPath, globalMemory.content as string)
      this.log.info(`Written global memory -> ${fullPath}`)
      fileResults.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write global memory: ${errMsg}`)
      fileResults.push({ path: relativePath, success: false, error: error as Error })
    }

    return { files: fileResults, dirs: dirResults }
  }

  private getGlobalSteeringDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), STEERING_SUBDIR)
  }

  /**
   * Build steering file name from childMemoryPrompt
   * Format: kiro-<folder-path>.md where nested folders use kebab-case separator
   * @example 'src/components' -> 'kiro-src-components.md'
   */
  private buildSteeringFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    // Replace path separators with kebab-case
    const normalizedPath = childPath
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\//g, '-')
    return `kiro-${normalizedPath}.md`
  }

  /**
   * Build steering file content with front matter
   * Uses fileMatch inclusion mode with glob pattern based on child directory
   */
  private buildSteeringContent(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath.replace(/\\/g, '/')

    // Build front matter with fileMatch inclusion
    const frontMatter = [
      '---',
      'inclusion: fileMatch',
      `fileMatchPattern: '${normalizedPath}/**'`,
      '---',
    ].join('\n')

    const content = child.content as string
    return `${frontMatter}\n${content}`
  }

  private async writeSteeringFile(
    ctx: OutputWriteContext,
    project: Project,
    child: ProjectChildrenMemoryPrompt,
  ): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const fileName = this.buildSteeringFileName(child)
    const targetDir = this.joinPath(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
    const fullPath = this.joinPath(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => STEERING_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    const content = this.buildSteeringContent(child)

    if (ctx.dryRun === true) {
      this.log.info(`[DRY-RUN] Would write steering file -> ${fullPath}`)
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      this.ensureDirectory(targetDir)
      this.writeFileSync(fullPath, content)
      this.log.info(`Written steering file -> ${fullPath}`)
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write steering file: ${errMsg}`)
      return { path: relativePath, success: false, error: error as Error }
    }
  }
}
