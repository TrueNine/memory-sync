import type {
  CollectedInputContext,
  CommandPrompt,
  InputPluginContext,
  Locale,
  LocalizedCommandPrompt,
  PluginOptions,
  ResolvedBasePaths
} from '../plugins/plugin-core'
import {
  AbstractInputPlugin,
  createLocalizedPromptReader
} from '../plugins/plugin-core'
import {
  FilePathKind,
  PromptKind
} from '../plugins/plugin-core'

export interface CommandPrefixInfo {
  readonly commandPrefix?: string
  readonly commandName: string
}

export class CommandInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('CommandInputPlugin')
  }

  private getDistDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    return this.resolveAindexPath(options.aindex.commands.dist, resolvedPaths.aindexDir)
  }

  private createCommandPrompt(
    content: string,
    _locale: Locale,
    name: string,
    _srcDir: string,
    distDir: string,
    ctx: InputPluginContext,
    _rawContent?: string
  ): CommandPrompt {
    const {path} = ctx

    const normalizedName = name.replaceAll('\\', '/') // Normalize Windows backslashes to forward slashes
    const slashIndex = normalizedName.indexOf('/')
    const parentDirName = slashIndex !== -1 ? normalizedName.slice(0, slashIndex) : void 0
    const fileName = slashIndex !== -1 ? normalizedName.slice(slashIndex + 1) : normalizedName

    const prefixInfo = this.extractPrefixInfo(fileName, parentDirName)

    const filePath = path.join(distDir, `${name}.mdx`)
    const entryName = `${name}.mdx`

    return {
      type: PromptKind.Command,
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
      ...prefixInfo.commandPrefix != null && {commandPrefix: prefixInfo.commandPrefix},
      commandName: prefixInfo.commandName
    } as CommandPrompt
  }

  extractPrefixInfo(fileName: string, parentDirName?: string): CommandPrefixInfo {
    const baseName = fileName.replace(/\.mdx$/, '')

    if (parentDirName != null) {
      return {
        commandPrefix: parentDirName,
        commandName: baseName
      }
    }

    const underscoreIndex = baseName.indexOf('_')

    if (underscoreIndex === -1) return {commandName: baseName}

    return {
      commandPrefix: baseName.slice(0, Math.max(0, underscoreIndex)),
      commandName: baseName.slice(Math.max(0, underscoreIndex + 1))
    }
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveAindexPath(options.aindex.commands.src, resolvedPaths.aindexDir)
    const distDir = this.getDistDir(options, resolvedPaths)

    logger.debug('CommandInputPlugin collecting', {
      srcDir,
      distDir,
      aindexDir: resolvedPaths.aindexDir
    })

    const reader = createLocalizedPromptReader(fs, path, logger, globalScope)

    const {prompts: localizedCommands, errors} = await reader.readFlatFiles(
      srcDir,
      distDir,
      {
        kind: PromptKind.Command,
        localeExtensions: {zh: '.cn.mdx', en: '.mdx'},
        isDirectoryStructure: false,
        createPrompt: async (content, locale, name, _metadata) => this.createCommandPrompt(
          content,
          locale,
          name,
          srcDir,
          distDir,
          ctx
        )
      }
    )

    logger.debug('CommandInputPlugin read complete', {
      commandCount: localizedCommands.length,
      errorCount: errors.length
    })

    for (const error of errors) logger.warn('Failed to read command', {path: error.path, phase: error.phase, error: error.error})

    const legacyCommands: CommandPrompt[] = []
    for (const localized of localizedCommands) {
      const prompt = localized.dist?.prompt ?? localized.src.default.prompt
      if (prompt) legacyCommands.push(prompt)
    }

    logger.debug('CommandInputPlugin legacy commands', {
      count: legacyCommands.length,
      commands: legacyCommands.map(c => c.commandName)
    })

    const promptIndex = new Map<string, LocalizedCommandPrompt>()
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
      commands: legacyCommands
    }
  }
}
