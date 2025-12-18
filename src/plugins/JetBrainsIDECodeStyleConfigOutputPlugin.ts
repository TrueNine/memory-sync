import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { FilePathKind, IDEKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

const IDEA_DIR = '.idea'
const CODE_STYLES_DIR = 'codeStyles'

export class JetBrainsIDECodeStyleConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('JetBrainsIDECodeStyleConfigOutputPlugin')
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) {
        continue
      }

      const ideaDir: RelativePath = {
        pathKind: FilePathKind.Relative,
        path: path.join(projectDir.path, IDEA_DIR, CODE_STYLES_DIR),
        basePath: projectDir.basePath,
        getDirectoryName: () => CODE_STYLES_DIR,
        getAbsolutePath: () => path.resolve(projectDir.basePath, projectDir.path, IDEA_DIR, CODE_STYLES_DIR),
      }
      results.push(ideaDir)
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { ideConfigFiles } = ctx.collectedInputContext
    const hasIdeaConfigs = ideConfigFiles.some(
      (f) => f.type === IDEKind.IntellijIDEA || f.type === IDEKind.EditorConfig,
    )

    if (!(hasIdeaConfigs)) {
      this.log.info('No JetBrains IDE config files found, skipping')
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
    const fullPath = path.resolve(projectDir.basePath, projectDir.path, targetRelativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, targetRelativePath),
      basePath: projectDir.basePath,
      getDirectoryName: () => path.dirname(targetRelativePath),
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.info(`[DRY-RUN] Would write ${label} -> ${fullPath}`)
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      const dir = path.dirname(fullPath)
      this.ensureDirectory(dir)
      fs.writeFileSync(fullPath, config.content, 'utf-8')
      this.log.info(`Written ${label} -> ${fullPath}`)
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write ${label}: ${errMsg}`)
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
      return path.join(IDEA_DIR, CODE_STYLES_DIR, path.basename(sourcePath))
    }

    // Default fallback
    return path.basename(sourcePath)
  }
}
