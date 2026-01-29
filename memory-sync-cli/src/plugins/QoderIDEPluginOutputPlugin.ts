import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@/markdown'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const QODER_CONFIG_DIR = '.qoder'
const RULES_SUBDIR = 'rules'
const COMMANDS_SUBDIR = 'commands'
const GLOBAL_RULE_FILE = 'global.md'
const PROJECT_RULE_FILE = 'always.md'
const CHILD_RULE_FILE_PREFIX = 'glob-'
const TRIGGER_ALWAYS = 'always_on'
const TRIGGER_GLOB = 'glob'
const RULE_GLOB_KEY = 'glob'

export class QoderIDEPluginOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('QoderIDEPluginOutputPlugin', {globalConfigDir: QODER_CONFIG_DIR})
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue
      results.push(this.createProjectRulesDirRelativePath(project.dirFromWorkspacePath))
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {globalMemory} = ctx.collectedInputContext

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (globalMemory != null) results.push(this.createProjectRuleFileRelativePath(projectDir, GLOBAL_RULE_FILE))

      if (project.rootMemoryPrompt != null) results.push(this.createProjectRuleFileRelativePath(projectDir, PROJECT_RULE_FILE))

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildChildRuleFileName(child)
          results.push(this.createProjectRuleFileRelativePath(projectDir, fileName))
        }
      }
    }

    return results
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {fastCommands} = ctx.collectedInputContext
    if (fastCommands == null || fastCommands.length === 0) return []

    const commandsDir = this.getGlobalCommandsDir()
    return [{
      pathKind: FilePathKind.Relative,
      path: COMMANDS_SUBDIR,
      basePath: this.getGlobalConfigDir(),
      getDirectoryName: () => COMMANDS_SUBDIR,
      getAbsolutePath: () => commandsDir
    }]
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {fastCommands} = ctx.collectedInputContext
    if (fastCommands == null || fastCommands.length === 0) return []

    const results: RelativePath[] = []
    const commandsDir = this.getGlobalCommandsDir()
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})

    for (const cmd of fastCommands) {
      const fileName = this.transformFastCommandName(cmd, transformOptions)
      const fullPath = path.join(commandsDir, fileName)
      results.push({
        pathKind: FilePathKind.Relative,
        path: fileName,
        basePath: commandsDir,
        getDirectoryName: () => COMMANDS_SUBDIR,
        getAbsolutePath: () => fullPath
      })
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands} = ctx.collectedInputContext
    const hasProjectPrompts = workspace.projects.some(
      project => project.rootMemoryPrompt != null || (project.childMemoryPrompts?.length ?? 0) > 0
    )
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0

    if (hasProjectPrompts || hasGlobalMemory || hasFastCommands) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (globalMemory != null) {
        const content = this.buildAlwaysRuleContent(globalMemory.content as string)
        const result = await this.writeProjectRuleFile(ctx, project, GLOBAL_RULE_FILE, content, 'globalRule')
        fileResults.push(result)
      }

      if (project.rootMemoryPrompt != null) {
        const content = this.buildAlwaysRuleContent(project.rootMemoryPrompt.content as string)
        const result = await this.writeProjectRuleFile(ctx, project, PROJECT_RULE_FILE, content, 'projectRootRule')
        fileResults.push(result)
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildChildRuleFileName(child)
          const content = this.buildGlobRuleContent(child)
          const result = await this.writeProjectRuleFile(ctx, project, fileName, content, 'projectChildRule')
          fileResults.push(result)
        }
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {fastCommands} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (fastCommands == null || fastCommands.length === 0) return {files: fileResults, dirs: dirResults}

    const commandsDir = this.getGlobalCommandsDir()
    for (const cmd of fastCommands) {
      const result = await this.writeGlobalFastCommand(ctx, commandsDir, cmd)
      fileResults.push(result)
    }

    return {files: fileResults, dirs: dirResults}
  }

  private getGlobalCommandsDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), COMMANDS_SUBDIR)
  }

  private createProjectRulesDirRelativePath(projectDir: RelativePath): RelativePath {
    const rulesDirPath = path.join(projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR)
    return {
      pathKind: FilePathKind.Relative,
      path: rulesDirPath,
      basePath: projectDir.basePath,
      getDirectoryName: () => RULES_SUBDIR,
      getAbsolutePath: () => path.join(projectDir.basePath, rulesDirPath)
    }
  }

  private createProjectRuleFileRelativePath(projectDir: RelativePath, fileName: string): RelativePath {
    const filePath = path.join(projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR, fileName)
    return {
      pathKind: FilePathKind.Relative,
      path: filePath,
      basePath: projectDir.basePath,
      getDirectoryName: () => RULES_SUBDIR,
      getAbsolutePath: () => path.join(projectDir.basePath, filePath)
    }
  }

  private buildChildRuleFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath
      .replaceAll('\\', '/')
      .replaceAll(/^\/+|\/+$/g, '')
      .replaceAll('/', '-')

    const suffix = normalizedPath.length > 0 ? normalizedPath : 'root'
    return `${CHILD_RULE_FILE_PREFIX}${suffix}.md`
  }

  private buildChildRulePattern(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath
      .replaceAll('\\', '/')
      .replaceAll(/^\/+|\/+$/g, '')

    if (normalizedPath.length === 0) return '**/*'
    return `${normalizedPath}/**`
  }

  private buildAlwaysRuleContent(content: string): string {
    const fmData: Record<string, unknown> = {
      trigger: TRIGGER_ALWAYS
    }

    return buildMarkdownWithFrontMatter(fmData, content)
  }

  private buildGlobRuleContent(child: ProjectChildrenMemoryPrompt): string {
    const pattern = this.buildChildRulePattern(child)
    const fmData: Record<string, unknown> = {
      trigger: TRIGGER_GLOB,
      [RULE_GLOB_KEY]: pattern
    }

    return buildMarkdownWithFrontMatter(fmData, child.content as string)
  }

  private async writeProjectRuleFile(
    ctx: OutputWriteContext,
    project: Project,
    fileName: string,
    content: string,
    label: string
  ): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const rulesDir = path.join(projectDir.basePath, projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR)
    const fullPath = path.join(rulesDir, fileName)

    const relativePath = this.createProjectRuleFileRelativePath(projectDir, fileName)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: label, path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(rulesDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: label, path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: label, path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private async writeGlobalFastCommand(
    ctx: OutputWriteContext,
    commandsDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const fullPath = path.join(commandsDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: fileName,
      basePath: commandsDir,
      getDirectoryName: () => COMMANDS_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    const content = this.buildMarkdownContentWithRaw(
      cmd.content,
      cmd.yamlFrontMatter,
      cmd.rawFrontMatter
    )

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalFastCommand', path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(commandsDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalFastCommand', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalFastCommand', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }
}
