import type {
  CollectedInputContext,
  InputPluginContext,
  Locale,
  LocalizedSubAgentPrompt,
  PluginOptions,
  ResolvedBasePaths,
  SubAgentPrompt
} from '@truenine/plugin-shared'
import {
  AbstractInputPlugin,
  createLocalizedPromptReader
} from '@truenine/plugin-input-shared'
import {
  FilePathKind,
  PromptKind
} from '@truenine/plugin-shared'

export interface AgentPrefixInfo {
  readonly agentPrefix?: string
  readonly agentName: string
}

export class SubAgentInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SubAgentInputPlugin')
  }

  private getDistDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    return this.resolveAindexPath(options.aindex.subAgents.dist, resolvedPaths.aindexDir)
  }

  private createSubAgentPrompt(
    content: string,
    _locale: Locale,
    name: string,
    _srcDir: string,
    distDir: string,
    ctx: InputPluginContext
  ): SubAgentPrompt {
    const {path} = ctx

    const normalizedName = name.replaceAll('\\', '/') // Normalize Windows backslashes to forward slashes
    const slashIndex = normalizedName.indexOf('/')
    const parentDirName = slashIndex !== -1 ? normalizedName.slice(0, slashIndex) : void 0
    const fileName = slashIndex !== -1 ? normalizedName.slice(slashIndex + 1) : normalizedName

    const prefixInfo = this.extractPrefixInfo(fileName, parentDirName)

    const filePath = path.join(distDir, `${name}.mdx`)
    const entryName = `${name}.mdx`

    return {
      type: PromptKind.SubAgent,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      dir: {
        pathKind: FilePathKind.Relative,
        path: entryName,
        basePath: distDir,
        getDirectoryName: () => entryName.replace(/\.mdx$/, ''),
        getAbsolutePath: () => filePath
      },
      ...prefixInfo.agentPrefix != null && {agentPrefix: prefixInfo.agentPrefix},
      agentName: prefixInfo.agentName
    } as SubAgentPrompt
  }

  extractPrefixInfo(fileName: string, parentDirName?: string): AgentPrefixInfo {
    const baseName = fileName.replace(/\.mdx$/, '')

    if (parentDirName != null) {
      return {
        agentPrefix: parentDirName,
        agentName: baseName
      }
    }

    const underscoreIndex = baseName.indexOf('_')

    if (underscoreIndex === -1) return {agentName: baseName}

    return {
      agentPrefix: baseName.slice(0, Math.max(0, underscoreIndex)),
      agentName: baseName.slice(Math.max(0, underscoreIndex + 1))
    }
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveAindexPath(options.aindex.subAgents.src, resolvedPaths.aindexDir)
    const distDir = this.getDistDir(options, resolvedPaths)

    logger.debug('SubAgentInputPlugin collecting', {
      srcDir,
      distDir,
      aindexDir: resolvedPaths.aindexDir
    })

    const reader = createLocalizedPromptReader(fs, path, logger, globalScope)

    const {prompts: localizedSubAgents, errors} = await reader.readFlatFiles(
      srcDir,
      distDir,
      {
        kind: PromptKind.SubAgent,
        localeExtensions: {zh: '.md', en: '.mdx'},
        isDirectoryStructure: false,
        createPrompt: async (content, locale, name) => this.createSubAgentPrompt(
          content,
          locale,
          name,
          srcDir,
          distDir,
          ctx
        )
      }
    )

    logger.debug('SubAgentInputPlugin read complete', {
      subAgentCount: localizedSubAgents.length,
      errorCount: errors.length
    })

    for (const error of errors) logger.warn('Failed to read subAgent', {path: error.path, phase: error.phase, error: error.error})

    const legacySubAgents: SubAgentPrompt[] = []
    for (const localized of localizedSubAgents) {
      const prompt = localized.dist?.prompt ?? localized.src.default.prompt
      if (prompt) legacySubAgents.push(prompt)
    }

    logger.debug('SubAgentInputPlugin legacy subAgents', {
      count: legacySubAgents.length,
      agents: legacySubAgents.map(a => a.agentName)
    })

    const promptIndex = new Map<string, LocalizedSubAgentPrompt>()
    for (const sub of localizedSubAgents) promptIndex.set(sub.name, sub)

    return {
      prompts: {
        skills: [],
        commands: [],
        subAgents: localizedSubAgents,
        rules: [],
        readme: []
      },
      promptIndex,
      subAgents: legacySubAgents
    }
  }
}
