import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import { FilePathKind, IDEKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

const IDEA_DIR = '.idea'
const CODE_STYLES_DIR = 'codeStyles'

/**
 * Default JetBrains IDE config files that this plugin manages.
 * These are the relative paths within each project directory.
 */
const JETBRAINS_CONFIG_FILES = [
  '.editorconfig',
  '.idea/codeStyles/Project.xml',
  '.idea/codeStyles/codeStyleConfig.xml',
  '.idea/.gitignore',
] as const

export class JetBrainsIDECodeStyleConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('JetBrainsIDECodeStyleConfigOutputPlugin')
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace
    const { ideConfigFiles } = ctx.collectedInputContext

    // Only register files if we have JetBrains configs to write
    const hasJetBrainsConfigs = ideConfigFiles.some(
      (f) => f.type === IDEKind.IntellijIDEA || f.type === IDEKind.EditorConfig,
    )
    if (!hasJetBrainsConfigs) {
      return results
    }

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) {
        continue
      }

      // Skip prompt source projects (e.g., aindex) - their files are source files
      // that should be protected from cleanup
      if (project.isPromptSourceProject === true) {
        continue
      }

      // Register all JetBrains config files for cleanup
      for (const configFile of JETBRAINS_CONFIG_FILES) {
        const filePath = this.joinPath(projectDir.path, configFile)
        results.push({
          pathKind: FilePathKind.Relative,
          path: filePath,
          basePath: projectDir.basePath,
          getDirectoryName: () => this.dirname(configFile),
          getAbsolutePath: () => this.resolvePath(projectDir.basePath, filePath),
        })
      }
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { ideConfigFiles } = ctx.collectedInputContext
    const hasIdeaConfigs = ideConfigFiles.some(
      (f) => f.type === IDEKind.IntellijIDEA || f.type === IDEKind.EditorConfig,
    )

    if (!hasIdeaConfigs) {
      this.log.debug('skipped', { reason: 'no JetBrains IDE config files found' })
      return false
    }

    return true
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { projects } = ctx.collectedInputContext.workspace
    const { ideConfigFiles } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    // Filter JetBrains IDE related config files
    const jetbrainsConfigs = ideConfigFiles.filter(
      (f) => f.type === IDEKind.IntellijIDEA || f.type === IDEKind.EditorConfig,
    )

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) {
        continue
      }

      const projectName = project.name ?? 'unknown'

      for (const config of jetbrainsConfigs) {
        const result = await this.writeConfigFile(
          ctx,
          projectDir,
          config,
          `project:${projectName}`,
        )
        fileResults.push(result)
      }
    }

    return { files: fileResults, dirs: dirResults }
  }

  private async writeConfigFile(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    config: { type: IDEKind, content: string, dir: { path: string } },
    label: string,
  ): Promise<WriteResult> {
    // Determine target path based on config type
    const targetRelativePath = this.getTargetRelativePath(config)
    const fullPath = this.resolvePath(projectDir.basePath, projectDir.path, targetRelativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: this.joinPath(projectDir.path, targetRelativePath),
      basePath: projectDir.basePath,
      getDirectoryName: () => this.dirname(targetRelativePath),
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'config', path: fullPath, label })
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      const dir = this.dirname(fullPath)
      this.ensureDirectory(dir)
      this.writeFileSync(fullPath, config.content)
      this.log.trace({ action: 'write', type: 'config', path: fullPath, label })
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'config', path: fullPath, label, error: errMsg })
      return { path: relativePath, success: false, error: error as Error }
    }
  }

  private getTargetRelativePath(config: { type: IDEKind, dir: { path: string } }): string {
    const sourcePath = config.dir.path

    if (config.type === IDEKind.EditorConfig) {
      return '.editorconfig'
    }

    if (config.type === IDEKind.IntellijIDEA) {
      // Extract relative path from source (e.g., .idea/codeStyles/Project.xml)
      const ideaIndex = sourcePath.indexOf(IDEA_DIR)
      if (ideaIndex !== -1) {
        return sourcePath.substring(ideaIndex)
      }
      // Fallback: use filename only
      return this.joinPath(IDEA_DIR, CODE_STYLES_DIR, this.basename(sourcePath))
    }

    // Default fallback
    return this.basename(sourcePath)
  }
}
