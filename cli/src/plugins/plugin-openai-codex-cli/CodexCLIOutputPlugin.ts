import type {
  CommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-core'
import * as path from 'node:path'
import {AbstractOutputPlugin, filterByProjectConfig, PLUGIN_NAMES} from '../plugin-core'

const PROJECT_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.codex'
const PROMPTS_SUBDIR = 'prompts'
const SKILLS_SUBDIR = 'skills'

export class CodexCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CodexCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      dependsOn: [PLUGIN_NAMES.AgentsOutput]
    })
  }

  override async registerProjectOutputDirs(): Promise<string[]> {
    return [] // Codex only supports global prompts and skills
  }

  override async registerProjectOutputFiles(): Promise<string[]> {
    return [] // AGENTS.md files are handled by AgentsOutputPlugin
  }

  override async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<string[]> {
    const globalDir = this.getGlobalConfigDir()
    const results: string[] = [
      path.join(globalDir, PROMPTS_SUBDIR)
    ]

    const {skills} = ctx.collectedOutputContext
    if (skills == null || skills.length === 0) return results

    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const filteredSkills = filterByProjectConfig(skills, projectConfig, 'skills')
    for (const skill of filteredSkills) {
      const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
      results.push(path.join(globalDir, SKILLS_SUBDIR, skillName))
    }
    return results
  }

  override async registerGlobalOutputFiles(): Promise<string[]> {
    const globalDir = this.getGlobalConfigDir()
    return [
      path.join(globalDir, PROJECT_MEMORY_FILE)
    ]
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {globalMemory, commands} = ctx.collectedOutputContext
    if (globalMemory != null || (commands?.length ?? 0) > 0) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  override async writeProjectOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // Handled by AgentsOutputPlugin
  }

  override async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, commands} = ctx.collectedOutputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []
    const globalDir = this.getGlobalConfigDir()

    if (globalMemory != null) {
      const fullPath = path.join(globalDir, PROJECT_MEMORY_FILE)
      const result = await this.writeFile(ctx, fullPath, globalMemory.content as string, 'globalMemory')
      fileResults.push(result)
    }

    if (commands == null || commands.length === 0) return {files: fileResults, dirs: []}

    const filteredCommands = filterByProjectConfig(commands, projectConfig, 'commands')
    for (const cmd of filteredCommands) {
      const result = await this.writeGlobalCommand(ctx, globalDir, cmd)
      fileResults.push(result)
    }
    return {files: fileResults, dirs: []}
  }

  private async writeGlobalCommand(
    ctx: OutputWriteContext,
    globalDir: string,
    cmd: CommandPrompt
  ): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformCommandName(cmd, transformOptions)
    const fullPath = path.join(globalDir, PROMPTS_SUBDIR, fileName)
    const content = this.buildMarkdownContentWithRaw(cmd.content, cmd.yamlFrontMatter, cmd.rawFrontMatter)
    return this.writeFile(ctx, fullPath, content, 'globalFastCommand')
  }
}
