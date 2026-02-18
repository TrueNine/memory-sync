import type {OutputPluginContext, OutputWriteContext, RulePrompt, WriteResults} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as path from 'node:path'
import {filterRulesByProjectConfig} from '@/utils/ruleFilter'
import {BaseCLIOutputPlugin} from './BaseCLIOutputPlugin'

const PROJECT_MEMORY_FILE = 'CLAUDE.md'
const GLOBAL_CONFIG_DIR = '.claude'
const RULES_SUBDIR = 'rules'
const RULE_FILE_PREFIX = 'rule-'

export class ClaudeCodeCLIOutputPlugin extends BaseCLIOutputPlugin {
  constructor() {
    super('ClaudeCodeCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      toolPreset: 'claudeCode',
      supportsFastCommands: true,
      supportsSubAgents: true,
      supportsSkills: true
    })
  }

  private buildRuleFileName(rule: RulePrompt): string {
    return `${RULE_FILE_PREFIX}${rule.series}-${rule.ruleName}.md`
  }

  private buildRuleContent(rule: RulePrompt): string {
    if (rule.globs.length === 0) return rule.content
    return this.buildMarkdownContent(rule.content, {paths: [...rule.globs]})
  }

  override async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results = await super.registerGlobalOutputDirs(ctx)
    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) results.push(this.createRelativePath(RULES_SUBDIR, this.getGlobalConfigDir(), () => RULES_SUBDIR))
    return results
  }

  override async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results = await super.registerGlobalOutputFiles(ctx)
    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return results
    const rulesDir = path.join(this.getGlobalConfigDir(), RULES_SUBDIR)
    for (const rule of globalRules) results.push(this.createRelativePath(this.buildRuleFileName(rule), rulesDir, () => RULES_SUBDIR))
    return results
  }

  override async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results = await super.registerProjectOutputDirs(ctx)
    const {rules} = ctx.collectedInputContext
    if (rules == null || rules.length === 0) return results
    for (const project of ctx.collectedInputContext.workspace.projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectRules = filterRulesByProjectConfig(
        rules.filter(r => this.normalizeRuleScope(r) === 'project'),
        project.projectConfig
      )
      if (projectRules.length === 0) continue
      const dirPath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir, RULES_SUBDIR)
      results.push(this.createRelativePath(dirPath, project.dirFromWorkspacePath.basePath, () => RULES_SUBDIR))
    }
    return results
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results = await super.registerProjectOutputFiles(ctx)
    const {rules} = ctx.collectedInputContext
    if (rules == null || rules.length === 0) return results
    for (const project of ctx.collectedInputContext.workspace.projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectRules = filterRulesByProjectConfig(
        rules.filter(r => this.normalizeRuleScope(r) === 'project'),
        project.projectConfig
      )
      for (const rule of projectRules) {
        const filePath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir, RULES_SUBDIR, this.buildRuleFileName(rule))
        results.push(this.createRelativePath(filePath, project.dirFromWorkspacePath.basePath, () => RULES_SUBDIR))
      }
    }
    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    if ((ctx.collectedInputContext.rules?.length ?? 0) > 0) return true
    return super.canWrite(ctx)
  }

  override async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const results = await super.writeGlobalOutputs(ctx)
    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return results
    const rulesDir = path.join(this.getGlobalConfigDir(), RULES_SUBDIR)
    const ruleResults = []
    for (const rule of globalRules) ruleResults.push(await this.writeFile(ctx, path.join(rulesDir, this.buildRuleFileName(rule)), this.buildRuleContent(rule), 'rule'))
    return {files: [...results.files, ...ruleResults], dirs: results.dirs}
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const results = await super.writeProjectOutputs(ctx)
    const {rules} = ctx.collectedInputContext
    if (rules == null || rules.length === 0) return results
    const ruleResults = []
    for (const project of ctx.collectedInputContext.workspace.projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectRules = filterRulesByProjectConfig(
        rules.filter(r => this.normalizeRuleScope(r) === 'project'),
        project.projectConfig
      )
      if (projectRules.length === 0) continue
      const rulesDir = path.join(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path, this.globalConfigDir, RULES_SUBDIR)
      for (const rule of projectRules) ruleResults.push(await this.writeFile(ctx, path.join(rulesDir, this.buildRuleFileName(rule)), this.buildRuleContent(rule), 'rule'))
    }
    return {files: [...results.files, ...ruleResults], dirs: results.dirs}
  }
}
