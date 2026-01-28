import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from 'memory-sync-cli/src/types'
import type {RelativePath} from 'memory-sync-cli/src/types/FileSystemTypes'
import {FilePathKind, IDEKind} from 'memory-sync-cli/src/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const VSCODE_DIR = '.vscode'

/**
 * Default VS Code config files that this plugin manages.
 * These are the relative paths within each project directory.
 */
const VSCODE_CONFIG_FILES = [
  '.vscode/settings.json',
  '.vscode/extensions.json'
] as const

export class VisualStudioCodeIDEConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('VisualStudioCodeIDEConfigOutputPlugin')
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {ideConfigFiles} = ctx.collectedInputContext

    const hasVSCodeConfigs = ideConfigFiles.some(f => f.type === IDEKind.VSCode) // Only register files if we have VS Code configs to write
    if (!hasVSCodeConfigs) return results

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (project.isPromptSourceProject === true) continue // that should be protected from cleanup // Skip prompt source projects (e.g., aindex) - their files are source files

      for (const configFile of VSCODE_CONFIG_FILES) { // Register all VS Code config files for cleanup
        const filePath = this.joinPath(projectDir.path, configFile)
        results.push({
          pathKind: FilePathKind.Relative,
          path: filePath,
          basePath: projectDir.basePath,
          getDirectoryName: () => this.dirname(configFile),
          getAbsolutePath: () => this.resolvePath(projectDir.basePath, filePath)
        })
      }
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {ideConfigFiles} = ctx.collectedInputContext
    const hasVSCodeConfigs = ideConfigFiles.some(f => f.type === IDEKind.VSCode)

    if (hasVSCodeConfigs) return true

    this.log.debug('skipped', {reason: 'no VS Code config files found'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {ideConfigFiles} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    const vscodeConfigs = ideConfigFiles.filter(f => f.type === IDEKind.VSCode) // Filter VS Code related config files

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      const projectName = project.name ?? 'unknown'

      for (const config of vscodeConfigs) {
        const result = await this.writeConfigFile(ctx, projectDir, config, `project:${projectName}`)
        fileResults.push(result)
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  private async writeConfigFile(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    config: {type: IDEKind, content: string, dir: {path: string}},
    label: string
  ): Promise<WriteResult> {
    const targetRelativePath = this.getTargetRelativePath(config)
    const fullPath = this.resolvePath(projectDir.basePath, projectDir.path, targetRelativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: this.joinPath(projectDir.path, targetRelativePath),
      basePath: projectDir.basePath,
      getDirectoryName: () => this.dirname(targetRelativePath),
      getAbsolutePath: () => fullPath
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'config', path: fullPath, label})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      const dir = this.dirname(fullPath)
      this.ensureDirectory(dir)
      this.writeFileSync(fullPath, config.content)
      this.log.trace({action: 'write', type: 'config', path: fullPath, label})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'config', path: fullPath, label, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private getTargetRelativePath(config: {type: IDEKind, dir: {path: string}}): string {
    const sourcePath = config.dir.path

    if (config.type !== IDEKind.VSCode) return this.basename(sourcePath)

    const vscodeIndex = sourcePath.indexOf(VSCODE_DIR)
    if (vscodeIndex !== -1) return sourcePath.slice(Math.max(0, vscodeIndex))
    return this.joinPath(VSCODE_DIR, this.basename(sourcePath))
  }
}
