import type {
  CollectedInputContext,
  FastCommandPrompt,
  InputPluginContext,
  Locale,
  LocalizedFastCommandPrompt,
  PluginOptions,
  ResolvedBasePaths
} from '@truenine/plugin-shared'
import {
  AbstractInputPlugin,
  createLocalizedPromptReader
} from '@truenine/plugin-input-shared'
import {
  FilePathKind,
  PromptKind
} from '@truenine/plugin-shared'

export interface SeriesInfo {
  readonly series?: string
  readonly commandName: string
}

export class FastCommandInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('FastCommandInputPlugin')
  }

  private getDistDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    return this.resolveShadowPath(options.shadowSourceProject.fastCommand.dist, resolvedPaths.shadowProjectDir)
  }

  private createFastCommandPrompt(
    content: string,
    _locale: Locale,
    name: string,
    srcDir: string,
    _distDir: string,
    ctx: InputPluginContext,
    _rawContent?: string
  ): FastCommandPrompt {
    const {path} = ctx

    const slashIndex = name.indexOf('/')
    const parentDirName = slashIndex !== -1 ? name.slice(0, slashIndex) : void 0
    const fileName = slashIndex !== -1 ? name.slice(slashIndex + 1) : name

    const seriesInfo = this.extractSeriesInfo(fileName, parentDirName)

    const filePath = path.join(srcDir, `${name}.cn.mdx`)
    const entryName = `${name}.mdx`

    return {
      type: PromptKind.FastCommand,
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
      commandName: seriesInfo.commandName
    } as FastCommandPrompt
  }

  extractSeriesInfo(fileName: string, parentDirName?: string): SeriesInfo {
    const baseName = fileName.replace(/\.mdx$/, '')

    if (parentDirName != null) {
      return {
        series: parentDirName,
        commandName: baseName
      }
    }

    const underscoreIndex = baseName.indexOf('_')

    if (underscoreIndex === -1) return {commandName: baseName}

    return {
      series: baseName.slice(0, Math.max(0, underscoreIndex)),
      commandName: baseName.slice(Math.max(0, underscoreIndex + 1))
    }
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveShadowPath(options.shadowSourceProject.fastCommand.src, resolvedPaths.shadowProjectDir)
    const distDir = this.getDistDir(options, resolvedPaths)

    const reader = createLocalizedPromptReader(fs, path, logger, globalScope)

    const {prompts: localizedCommands, errors} = await reader.readFlatFiles(
      srcDir,
      distDir,
      {
        kind: PromptKind.FastCommand,
        localeExtensions: {zh: '.cn.mdx', en: '.mdx'},
        isDirectoryStructure: false,
        createPrompt: async (content, locale, name) => this.createFastCommandPrompt(
          content,
          locale,
          name,
          srcDir,
          distDir,
          ctx
        )
      }
    )

    for (const error of errors) logger.warn('Failed to read command', {path: error.path, phase: error.phase, error: error.error})

    const legacyCommands: FastCommandPrompt[] = []
    for (const localized of localizedCommands) {
      const prompt = localized.dist?.prompt ?? localized.src.default.prompt
      if (prompt) legacyCommands.push(prompt)
    }

    const promptIndex = new Map<string, LocalizedFastCommandPrompt>()
    for (const cmd of localizedCommands) promptIndex.set(cmd.name, cmd)

    return {
      prompts: {
        skills: [],
        commands: localizedCommands,
        subAgents: [],
        rules: [],
        readme: []
      },
      promptIndex,
      fastCommands: legacyCommands
    }
  }
}
