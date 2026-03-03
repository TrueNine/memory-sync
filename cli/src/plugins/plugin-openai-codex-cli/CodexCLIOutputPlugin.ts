import type {
  CommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-shared'
import type {RelativePath} from '../plugin-shared/types'
import * as path from 'node:path'
import {AbstractOutputPlugin, filterCommandsByProjectConfig, filterSkillsByProjectConfig} from '@truenine/plugin-output-shared'
import {PLUGIN_NAMES} from '../plugin-shared'

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

  async registerProjectOutputDirs(): Promise<RelativePath[]> {
    return [] // Codex only supports global prompts and skills
  }

  async registerProjectOutputFiles(): Promise<RelativePath[]> {
    return [] // AGENTS.md files are handled by AgentsOutputPlugin
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    const results: RelativePath[] = [
      this.createRelativePath(PROMPTS_SUBDIR, globalDir, () => PROMPTS_SUBDIR)
    ]

    const {skills} = ctx.collectedInputContext
    if (skills == null || skills.length === 0) return results

    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
    for (const skill of filteredSkills) {
      const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
      results.push(this.createRelativePath(
        path.join(SKILLS_SUBDIR, skillName),
        globalDir,
        () => skillName
      ))
    }
    return results
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    return [
      this.createRelativePath(PROJECT_MEMORY_FILE, globalDir, () => GLOBAL_CONFIG_DIR)
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {globalMemory, commands} = ctx.collectedInputContext
    if (globalMemory != null || (commands?.length ?? 0) > 0) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // Handled by AgentsOutputPlugin
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, commands} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []
    const globalDir = this.getGlobalConfigDir()

    if (globalMemory != null) {
      const fullPath = path.join(globalDir, PROJECT_MEMORY_FILE)
      const result = await this.writeFile(ctx, fullPath, globalMemory.content as string, 'globalMemory')
      fileResults.push(result)
    }

    if (commands == null || commands.length === 0) return {files: fileResults, dirs: []}

    const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
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
