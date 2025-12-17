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
import type { Logger } from '@/log'
import type {
  OutputPlugin,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  WriteResult,
  WriteResults,
  YAMLFrontMatter,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createLogger } from '@/log'
import { FilePathKind, PluginKind } from '@/types'

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
export class KiroCLIOutputPlugin implements OutputPlugin {
  readonly type = PluginKind.Output
  readonly name = 'KiroCLIOutputPlugin'
  readonly log: Logger

  constructor() {
    this.log = createLogger(this.name)
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      // Register <project>/.kiro/steering/ for cleanup
      const steeringDir = path.join(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
      results.push({
        pathKind: FilePathKind.Relative,
        path: steeringDir,
        basePath: project.dirFromWorkspacePath.basePath,
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, steeringDir),
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
          const filePath = path.join(
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
            getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, filePath),
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
        basePath: path.join(os.homedir(), GLOBAL_CONFIG_DIR),
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
        getAbsolutePath: () => path.join(globalDir, GLOBAL_MEMORY_FILE),
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
    const fullPath = path.join(globalDir, GLOBAL_MEMORY_FILE)
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
      if (!fs.existsSync(globalDir)) {
        fs.mkdirSync(globalDir, { recursive: true })
      }

      fs.writeFileSync(fullPath, globalMemory.content as string, 'utf-8')
      this.log.info(`Written global memory -> ${fullPath}`)
      fileResults.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write global memory: ${errMsg}`)
      fileResults.push({ path: relativePath, success: false, error: error as Error })
    }

    return { files: fileResults, dirs: dirResults }
  }

  async onWriteComplete(ctx: OutputWriteContext, results: WriteResults): Promise<void> {
    const successCount = results.files.filter((r) => r.success).length
    const skipCount = results.files.filter((r) => r.skipped).length
    const failCount = results.files.filter((r) => !(r.success) && !(r.skipped)).length

    const mode = ctx.dryRun === true ? '[DRY-RUN]' : ''
    this.log.info(`${mode} Write complete: ${successCount} success, ${skipCount} skipped, ${failCount} failed`)
  }

  private getGlobalSteeringDir(): string {
    return path.join(os.homedir(), GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
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
    const targetDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR, fileName),
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
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
      fs.writeFileSync(fullPath, content, 'utf-8')
      this.log.info(`Written steering file -> ${fullPath}`)
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write steering file: ${errMsg}`)
      return { path: relativePath, success: false, error: error as Error }
    }
  }
}
