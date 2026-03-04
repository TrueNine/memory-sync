import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-core'
import {AbstractOutputPlugin} from '../plugin-core'
import {IDEKind} from '../plugin-core'

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
  '.idea/.gitignore'
] as const

export class JetBrainsIDECodeStyleConfigOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('JetBrainsIDECodeStyleConfigOutputPlugin')
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
    const {jetbrainsConfigFiles, editorConfigFiles} = ctx.collectedInputContext

    const hasJetBrainsConfigs = (jetbrainsConfigFiles != null && jetbrainsConfigFiles.length > 0)
      || (editorConfigFiles != null && editorConfigFiles.length > 0)
    if (!hasJetBrainsConfigs) return results

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (project.isPromptSourceProject === true) continue

      for (const configFile of JETBRAINS_CONFIG_FILES) results.push(this.joinPath(projectDir.path, configFile))
    }

    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {jetbrainsConfigFiles, editorConfigFiles} = ctx.collectedInputContext
    const hasIdeaConfigs = (jetbrainsConfigFiles != null && jetbrainsConfigFiles.length > 0)
      || (editorConfigFiles != null && editorConfigFiles.length > 0)

    if (hasIdeaConfigs) return true

    this.log.debug('skipped', {reason: 'no JetBrains IDE config files found'})
    return false
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {jetbrainsConfigFiles, editorConfigFiles} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    const jetbrainsConfigs = [
      ...jetbrainsConfigFiles ?? [],
      ...editorConfigFiles ?? []
    ]

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      const projectName = project.name ?? 'unknown'

      for (const config of jetbrainsConfigs) {
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

    if (config.type === IDEKind.EditorConfig) return '.editorconfig'

    if (config.type !== IDEKind.IntellijIDEA) return this.basename(sourcePath)

    const ideaIndex = sourcePath.indexOf(IDEA_DIR)
    if (ideaIndex !== -1) return sourcePath.slice(Math.max(0, ideaIndex))
    return this.joinPath(IDEA_DIR, CODE_STYLES_DIR, this.basename(sourcePath))
  }
}
