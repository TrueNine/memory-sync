import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-core'
import {AbstractOutputPlugin} from '../plugin-core'
import {IDEKind} from '../plugin-core'

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

  override async registerGlobalOutputFiles(): Promise<string[]> {
    return [] // No global files to output
  }

  override async writeGlobalOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // No global outputs to write
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {vscodeConfigFiles} = ctx.collectedInputContext

    const hasVSCodeConfigs = vscodeConfigFiles != null && vscodeConfigFiles.length > 0
    if (!hasVSCodeConfigs) return results

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (project.isPromptSourceProject === true) continue

      for (const configFile of VSCODE_CONFIG_FILES) {
        const filePath = this.joinPath(projectDir.path, configFile)
        results.push(filePath)
      }
    }

    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {vscodeConfigFiles} = ctx.collectedInputContext
    const hasVSCodeConfigs = vscodeConfigFiles != null && vscodeConfigFiles.length > 0

    if (hasVSCodeConfigs) return true

    this.log.debug('skipped', {reason: 'no VS Code config files found'})
    return false
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {vscodeConfigFiles} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    const vscodeConfigs = vscodeConfigFiles ?? []

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
    projectDir: {path: string, basePath: string},
    config: {type: IDEKind, content: string, dir: {path: string}},
    label: string
  ): Promise<WriteResult> {
    const targetRelativePath = this.getTargetRelativePath(config)
    const fullPath = this.resolvePath(projectDir.basePath, projectDir.path, targetRelativePath)

    const relativePath = this.joinPath(projectDir.path, targetRelativePath)

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
