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

export interface SubAgentSeriesInfo {
  readonly series?: string
  readonly agentName: string
}

export class SubAgentInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SubAgentInputPlugin')
  }

  private getDistDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    return this.resolveShadowPath(options.shadowSourceProject.subAgent.dist, resolvedPaths.shadowProjectDir)
  }

  private createSubAgentPrompt(
    content: string,
    _locale: Locale,
    name: string,
    srcDir: string,
    _distDir: string,
    ctx: InputPluginContext
  ): SubAgentPrompt {
    const {path} = ctx

    const slashIndex = name.indexOf('/')
    const parentDirName = slashIndex !== -1 ? name.slice(0, slashIndex) : void 0
    const fileName = slashIndex !== -1 ? name.slice(slashIndex + 1) : name

    const seriesInfo = this.extractSeriesInfo(fileName, parentDirName)

    const filePath = path.join(srcDir, `${name}.cn.mdx`)
    const entryName = `${name}.mdx`

    return {
      type: PromptKind.SubAgent,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      dir: {
        pathKind: FilePathKind.Relative,
        path: entryName,
        basePath: srcDir,
        getDirectoryName: () => entryName.replace(/\.mdx$/, ''),
        getAbsolutePath: () => filePath
      },
      ...seriesInfo.series != null && {series: seriesInfo.series},
      agentName: seriesInfo.agentName
    } as SubAgentPrompt
  }

  extractSeriesInfo(fileName: string, parentDirName?: string): SubAgentSeriesInfo {
    const baseName = fileName.replace(/\.mdx$/, '')

    if (parentDirName != null) {
      return {
        series: parentDirName,
        agentName: baseName
      }
    }

    const underscoreIndex = baseName.indexOf('_')

    if (underscoreIndex === -1) return {agentName: baseName}

    return {
      series: baseName.slice(0, Math.max(0, underscoreIndex)),
      agentName: baseName.slice(Math.max(0, underscoreIndex + 1))
    }
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveShadowPath(options.shadowSourceProject.subAgent.src, resolvedPaths.shadowProjectDir)
    const distDir = this.getDistDir(options, resolvedPaths)

    const reader = createLocalizedPromptReader(fs, path, logger, globalScope)

    const {prompts: localizedSubAgents, errors} = await reader.readFlatFiles(
      srcDir,
      distDir,
      {
        kind: PromptKind.SubAgent,
        localeExtensions: {zh: '.cn.mdx', en: '.mdx'},
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

    for (const error of errors) logger.warn('Failed to read subAgent', {path: error.path, phase: error.phase, error: error.error})

    const legacySubAgents: SubAgentPrompt[] = []
    for (const localized of localizedSubAgents) {
      const prompt = localized.dist?.prompt ?? localized.src.default.prompt
      if (prompt) legacySubAgents.push(prompt)
    }

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
