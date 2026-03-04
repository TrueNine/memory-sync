import type {CommandPrompt, OutputPluginContext, OutputWriteContext, RulePrompt, SkillPrompt, SubAgentPrompt, WriteResult, WriteResults} from '../plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  AbstractOutputPlugin,
  filterCommandsByProjectConfig,
  filterSkillsByProjectConfig,
  filterSubAgentsByProjectConfig,
  McpConfigManager,
  transformMcpConfigForOpencode
} from '../plugin-core'
import {PLUGIN_NAMES} from '../plugin-core'

const GLOBAL_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.config/opencode'
const OPENCODE_CONFIG_FILE = 'opencode.json'
const OPENCODE_RULES_PLUGIN_NAME = 'opencode-rules@latest'
const PROJECT_RULES_DIR = '.opencode'
const RULES_SUBDIR = 'rules'

/**
 * Opencode CLI output plugin.
 * Outputs global memory, commands, agents, and skills to ~/.config/opencode/
 */
export class OpencodeCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('OpencodeCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      commandsSubDir: 'commands',
      skillsSubDir: 'skills',
      supportsCommands: true,
      supportsSkills: true,
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      rules: {
        enabled: true,
        subDir: RULES_SUBDIR,
        transformFrontMatter: (rule: RulePrompt) => ({globs: [...rule.globs]})
      }
    })

    this.registerCleanEffect('mcp-config-cleanup', async ctx => {
      const globalDir = this.getGlobalConfigDir()
      const configPath = path.join(globalDir, OPENCODE_CONFIG_FILE)

      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'mcpConfigCleanup', path: configPath})
        return {success: true, description: 'Would reset opencode.json mcp to empty'}
      }

      try {
        if (fs.existsSync(configPath)) {
          const existingContent = fs.readFileSync(configPath, 'utf8')
          const existingConfig = JSON.parse(existingContent) as Record<string, unknown>
          existingConfig['mcp'] = {}

          const pluginField = existingConfig['plugin']
          if (Array.isArray(pluginField)) {
            const filtered = pluginField.filter(item => item !== OPENCODE_RULES_PLUGIN_NAME)
            if (filtered.length > 0) existingConfig['plugin'] = filtered
            else delete existingConfig['plugin']
          }

          fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2))
        }
        this.log.trace({action: 'clean', type: 'mcpConfigCleanup', path: configPath})
        return {success: true, description: 'Reset opencode.json mcp to empty'}
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'clean', type: 'mcpConfigCleanup', path: configPath, error: errMsg})
        return {success: false, error: error as Error, description: 'Failed to reset opencode.json mcp'}
      }
    })
  }

  override async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results = await super.registerGlobalOutputFiles(ctx)
    const globalDir = this.getGlobalConfigDir()

    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const filteredSkills = ctx.collectedInputContext.skills != null
      ? filterSkillsByProjectConfig(ctx.collectedInputContext.skills, projectConfig)
      : []
    const hasAnyMcpConfig = filteredSkills.some(s => s.mcpConfig != null)
    if (hasAnyMcpConfig) results.push(path.join(globalDir, OPENCODE_CONFIG_FILE))

    return results.map(result => { // Normalize skill directory names in paths
      const normalizedPath = result.replaceAll('\\', '/')
      const skillsPatternWithSlash = `/${this.skillsSubDir}/`
      const skillsPatternStart = `${this.skillsSubDir}/`

      if (!(normalizedPath.includes(skillsPatternWithSlash) || normalizedPath.startsWith(skillsPatternStart))) return result

      const pathParts = normalizedPath.split('/')
      const skillsIndex = pathParts.indexOf(this.skillsSubDir)
      if (skillsIndex < 0 || skillsIndex + 1 >= pathParts.length) return result

      const skillName = pathParts[skillsIndex + 1]
      if (skillName == null) return result

      const normalizedSkillName = this.validateAndNormalizeSkillName(skillName)
      const newPathParts = [...pathParts]
      newPathParts[skillsIndex + 1] = normalizedSkillName
      const newPath = newPathParts.join('/')
      return newPath
    })
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.rootMemoryPrompt != null && project.dirFromWorkspacePath != null) {
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath.path, this.outputFileName))
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          if (child.dir != null && this.isRelativePath(child.dir)) results.push(this.createFileRelativePath(child.dir.path, this.outputFileName))
        }
      }

      if (project.dirFromWorkspacePath == null) continue

      const {projectConfig} = project
      const basePath = path.join(project.dirFromWorkspacePath.path, PROJECT_RULES_DIR)
      const transformOptions = {includeSeriesPrefix: true} as const

      if (this.supportsCommands && ctx.collectedInputContext.commands != null) {
        const filteredCommands = filterCommandsByProjectConfig(ctx.collectedInputContext.commands, projectConfig)
        for (const cmd of filteredCommands) {
          const fileName = this.transformCommandName(cmd, transformOptions)
          results.push(this.createRelativePath(path.join(basePath, this.commandsSubDir, fileName), project.dirFromWorkspacePath.basePath, () => this.commandsSubDir))
        }
      }

      if (this.supportsSubAgents && ctx.collectedInputContext.subAgents != null) {
        const filteredSubAgents = filterSubAgentsByProjectConfig(ctx.collectedInputContext.subAgents, projectConfig)
        for (const agent of filteredSubAgents) {
          const fileName = agent.dir.path.replace(/\.mdx$/, '.md')
          const subDir = this.agentsSubDir
          results.push(this.createRelativePath(path.join(basePath, subDir, fileName), project.dirFromWorkspacePath.basePath, () => subDir))
        }
      }

      if (this.supportsSkills && ctx.collectedInputContext.skills != null) {
        const filteredSkills = filterSkillsByProjectConfig(ctx.collectedInputContext.skills, projectConfig)
        for (const skill of filteredSkills) {
          const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
          const skillDir = path.join(basePath, this.skillsSubDir, skillName)

          results.push(this.createRelativePath(path.join(skillDir, 'SKILL.md'), project.dirFromWorkspacePath.basePath, () => skillName))

          if (skill.childDocs != null) {
            for (const refDoc of skill.childDocs) {
              const refDocFileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
              results.push(this.createRelativePath(path.join(skillDir, refDocFileName), project.dirFromWorkspacePath.basePath, () => skillName))
            }
          }

          if (skill.resources != null) {
            for (const resource of skill.resources) {
              results.push(this.createRelativePath(path.join(skillDir, resource.relativePath), project.dirFromWorkspacePath.basePath, () => skillName))
            }
          }
        }
      }
    }

    return results.map(result => {
      const normalizedPath = result.replaceAll('\\', '/')
      const skillsPatternWithSlash = `/${this.skillsSubDir}/`
      const skillsPatternStart = `${this.skillsSubDir}/`

      if (!(normalizedPath.includes(skillsPatternWithSlash) || normalizedPath.startsWith(skillsPatternStart))) return result

      const pathParts = normalizedPath.split('/')
      const skillsIndex = pathParts.indexOf(this.skillsSubDir)
      if (skillsIndex < 0 || skillsIndex + 1 >= pathParts.length) return result

      const skillName = pathParts[skillsIndex + 1]
      if (skillName == null) return result

      const normalizedSkillName = this.validateAndNormalizeSkillName(skillName)
      const newPathParts = [...pathParts]
      newPathParts[skillsIndex + 1] = normalizedSkillName
      const newPath = newPathParts.join('/')
      return newPath
    })
  }

  override async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const baseResults = await super.writeGlobalOutputs(ctx)
    const files = [...baseResults.files]

    const {skills} = ctx.collectedInputContext
    if (skills == null) return {files, dirs: baseResults.dirs}

    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
    const mcpResult = await this.writeGlobalMcpConfig(ctx, filteredSkills)
    if (mcpResult != null) files.push(mcpResult)
    return {files, dirs: baseResults.dirs}
  }

  private async writeGlobalMcpConfig(
    ctx: OutputWriteContext,
    skills: readonly SkillPrompt[]
  ): Promise<WriteResult | null> {
    const manager = new McpConfigManager({fs, logger: this.log})

    const servers = manager.collectMcpServers(skills)
    if (servers.size === 0) return null

    const transformed = manager.transformMcpServers(servers, transformMcpConfigForOpencode)
    const globalDir = this.getGlobalConfigDir()
    const configPath = path.join(globalDir, OPENCODE_CONFIG_FILE)

    const relativePath = path.join(globalDir, OPENCODE_CONFIG_FILE)

    const existingConfig = manager.readExistingConfig(configPath)
    const pluginField = existingConfig['plugin']
    const plugins: string[] = Array.isArray(pluginField) ? pluginField.map(item => String(item)) : []
    if (!plugins.includes(OPENCODE_RULES_PLUGIN_NAME)) plugins.push(OPENCODE_RULES_PLUGIN_NAME)

    const result = manager.writeOpencodeMcpConfig(
      configPath,
      transformed,
      ctx.dryRun === true,
      {
        $schema: 'https://opencode.ai/config.json',
        plugin: plugins
      }
    )

    if (!result.success) {
      if (result.error != null) return {path: relativePath, success: false, error: result.error}
      return {path: relativePath, success: false}
    }

    if (result.skipped === true) return {path: relativePath, success: true, skipped: true}
    return {path: relativePath, success: true}
  }

  protected override async writeSubAgent(
    ctx: OutputWriteContext,
    basePath: string,
    agent: SubAgentPrompt
  ): Promise<WriteResult[]> {
    const fileName = agent.dir.path.replace(/\.mdx$/, '.md')
    const subDir = this.agentsSubDir
    const targetDir = path.join(basePath, subDir)
    const fullPath = path.join(targetDir, fileName)

    const opencodeFrontMatter = this.buildOpencodeAgentFrontMatter(agent)
    const content = this.buildMarkdownContent(agent.content, opencodeFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'subAgent')]
  }

  private buildOpencodeAgentFrontMatter(agent: SubAgentPrompt): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = agent.yamlFrontMatter as Record<string, unknown> | undefined

    if (source?.['description'] != null) frontMatter['description'] = source['description']

    frontMatter['mode'] = source?.['mode'] ?? 'subagent'

    if (source?.['model'] != null) frontMatter['model'] = source['model']
    if (source?.['temperature'] != null) frontMatter['temperature'] = source['temperature']
    if (source?.['maxSteps'] != null) frontMatter['maxSteps'] = source['maxSteps']
    if (source?.['hidden'] != null) frontMatter['hidden'] = source['hidden']

    if (source?.['allowTools'] != null && Array.isArray(source['allowTools'])) {
      const tools: Record<string, boolean> = {}
      for (const tool of source['allowTools']) tools[String(tool)] = true
      frontMatter['tools'] = tools
    }

    if (source?.['permission'] != null && typeof source['permission'] === 'object') frontMatter['permission'] = source['permission']

    for (const [key, value] of Object.entries(source ?? {})) {
      if (!['description', 'mode', 'model', 'temperature', 'maxSteps', 'hidden', 'allowTools', 'permission', 'namingCase', 'name', 'color'].includes(key)) {
        frontMatter[key] = value
      }
    }

    return frontMatter
  }

  protected override async writeCommand(
    ctx: OutputWriteContext,
    basePath: string,
    cmd: CommandPrompt
  ): Promise<WriteResult[]> {
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformCommandName(cmd, transformOptions)
    const targetDir = path.join(basePath, this.commandsSubDir)
    const fullPath = path.join(targetDir, fileName)

    const opencodeFrontMatter = this.buildOpencodeCommandFrontMatter(cmd)
    const content = this.buildMarkdownContent(cmd.content, opencodeFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'command')]
  }

  private buildOpencodeCommandFrontMatter(cmd: CommandPrompt): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = cmd.yamlFrontMatter as Record<string, unknown> | undefined

    if (source?.['description'] != null) frontMatter['description'] = source['description']
    if (source?.['agent'] != null) frontMatter['agent'] = source['agent']
    if (source?.['model'] != null) frontMatter['model'] = source['model']

    if (source?.['allowTools'] != null && Array.isArray(source['allowTools'])) {
      const tools: Record<string, boolean> = {}
      for (const tool of source['allowTools']) tools[String(tool)] = true
      frontMatter['tools'] = tools
    }

    for (const [key, value] of Object.entries(source ?? {})) {
      if (!['description', 'agent', 'model', 'allowTools', 'namingCase', 'argumentHint'].includes(key)) frontMatter[key] = value
    }

    return frontMatter
  }

  protected override async writeSkill(
    ctx: OutputWriteContext,
    basePath: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = this.validateAndNormalizeSkillName((skill.yamlFrontMatter?.name as string | undefined) ?? skill.dir.getDirectoryName())
    const targetDir = path.join(basePath, this.skillsSubDir, skillName)
    const fullPath = path.join(targetDir, 'SKILL.md')

    const opencodeFrontMatter = this.buildOpencodeSkillFrontMatter(skill, skillName)
    const content = this.buildMarkdownContent(skill.content as string, opencodeFrontMatter)

    const mainFileResult = await this.writeFile(ctx, fullPath, content, 'skill')
    results.push(mainFileResult)

    if (skill.childDocs != null) {
      for (const refDoc of skill.childDocs) {
        const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, {dir: refDoc.dir.path, content: refDoc.content}, basePath)
        results.push(...refResults)
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) {
        const refResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, basePath)
        results.push(...refResults)
      }
    }

    return results
  }

  private buildOpencodeSkillFrontMatter(skill: SkillPrompt, skillName: string): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = skill.yamlFrontMatter as Record<string, unknown> | undefined

    frontMatter['name'] = skillName
    if (source?.['description'] != null) frontMatter['description'] = source['description']

    frontMatter['license'] = source?.['license'] ?? 'MIT'
    frontMatter['compatibility'] = source?.['compatibility'] ?? 'opencode'

    const metadata: Record<string, unknown> = {}
    const metadataFields = ['author', 'version', 'keywords', 'category', 'repository', 'displayName']

    for (const field of metadataFields) {
      if (source?.[field] != null) metadata[field] = source[field]
    }

    const reservedFields = new Set(['name', 'description', 'license', 'compatibility', 'namingCase', 'allowTools', 'keywords', 'displayName', 'author', 'version'])
    for (const [key, value] of Object.entries(source ?? {})) {
      if (!reservedFields.has(key)) metadata[key] = value
    }

    if (Object.keys(metadata).length > 0) frontMatter['metadata'] = metadata

    return frontMatter
  }

  private validateAndNormalizeSkillName(name: string): string {
    let normalized = name.toLowerCase()
    normalized = normalized.replaceAll(/[^a-z0-9-]+/g, '-')
    normalized = normalized.replaceAll(/-+/g, '-')
    normalized = normalized.replaceAll(/^-|-$/g, '')

    if (normalized.length === 0) normalized = 'skill'
    else if (normalized.length > 64) {
      normalized = normalized.slice(0, 64)
      normalized = normalized.replace(/-$/, '')
    }

    return normalized
  }

  override async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {projects} = ctx.collectedInputContext.workspace

    const subdirs: string[] = []
    if (this.supportsCommands) subdirs.push(this.commandsSubDir)
    if (this.supportsSubAgents) subdirs.push(this.agentsSubDir)
    if (this.supportsSkills) subdirs.push(this.skillsSubDir)

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue
      for (const subdir of subdirs) {
        const dirPath = path.join(project.dirFromWorkspacePath.path, PROJECT_RULES_DIR, subdir)
        results.push(dirPath)
      }
    }

    return results
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of ctx.collectedInputContext.workspace.projects) {
      if (project.dirFromWorkspacePath == null) continue

      const projectDir = project.dirFromWorkspacePath
      const {projectConfig} = project
      const basePath = path.join(projectDir.basePath, projectDir.path, PROJECT_RULES_DIR)

      if (project.rootMemoryPrompt != null) {
        const result = await this.writePromptFile(ctx, projectDir, project.rootMemoryPrompt.content as string, `project:${project.name}/root`)
        fileResults.push(result)
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const childResult = await this.writePromptFile(ctx, child.dir, child.content as string, `project:${project.name}/child:${child.workingChildDirectoryPath?.path ?? 'unknown'}`)
          fileResults.push(childResult)
        }
      }

      if (this.supportsCommands && ctx.collectedInputContext.commands != null) {
        const filteredCommands = filterCommandsByProjectConfig(ctx.collectedInputContext.commands, projectConfig)
        for (const cmd of filteredCommands) {
          const cmdResults = await this.writeCommand(ctx, basePath, cmd)
          fileResults.push(...cmdResults)
        }
      }

      if (this.supportsSubAgents && ctx.collectedInputContext.subAgents != null) {
        const filteredSubAgents = filterSubAgentsByProjectConfig(ctx.collectedInputContext.subAgents, projectConfig)
        for (const agent of filteredSubAgents) {
          const agentResults = await this.writeSubAgent(ctx, basePath, agent)
          fileResults.push(...agentResults)
        }
      }

      if (this.supportsSkills && ctx.collectedInputContext.skills != null) {
        const filteredSkills = filterSkillsByProjectConfig(ctx.collectedInputContext.skills, projectConfig)
        for (const skill of filteredSkills) {
          const skillResults = await this.writeSkill(ctx, basePath, skill)
          fileResults.push(...skillResults)
        }
      }
    }

    return {files: fileResults, dirs: dirResults}
  }
}
