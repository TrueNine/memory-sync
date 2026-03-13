import type {
  CommandPrompt,
  CommandYAMLFrontMatter,
  InputCollectedContext,
  InputPluginContext,
  Locale
} from '../plugins/plugin-core'
import {
  AbstractInputPlugin,
  createLocalizedPromptReader,
  FilePathKind,
  PromptKind,
  SourceLocaleExtensions

} from '../plugins/plugin-core'

export class CommandInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('CommandInputPlugin')
  }

  private createCommandPrompt(
    content: string,
    _locale: Locale,
    name: string,
    distDir: string,
    ctx: InputPluginContext,
    metadata?: Record<string, unknown>
  ): CommandPrompt {
    const {path} = ctx

    const normalizedName = name.replaceAll('\\', '/') // Normalize Windows backslashes to forward slashes
    const slashIndex = normalizedName.indexOf('/')
    const parentDirName = slashIndex !== -1 ? normalizedName.slice(0, slashIndex) : void 0
    const fileName = slashIndex !== -1 ? normalizedName.slice(slashIndex + 1) : normalizedName

    const baseName = fileName.replace(/\.mdx$/, '')
    const underscoreIndex = baseName.indexOf('_')
    const commandPrefix = parentDirName ?? (underscoreIndex === -1 ? void 0 : baseName.slice(0, Math.max(0, underscoreIndex)))
    const commandName = parentDirName != null || underscoreIndex === -1
      ? baseName
      : baseName.slice(Math.max(0, underscoreIndex + 1))

    const filePath = path.join(distDir, `${name}.mdx`)
    const entryName = `${name}.mdx`
    const yamlFrontMatter = metadata as CommandYAMLFrontMatter | undefined

    const prompt: CommandPrompt = {
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
      ...commandPrefix != null && {commandPrefix},
      commandName
    } as CommandPrompt

    if (yamlFrontMatter == null) return prompt

    Object.assign(prompt, {yamlFrontMatter})
    if (yamlFrontMatter.seriName != null) Object.assign(prompt, {seriName: yamlFrontMatter.seriName})
    if (yamlFrontMatter.scope === 'global') Object.assign(prompt, {globalOnly: true})
    return prompt
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveAindexPath(options.aindex.commands.src, resolvedPaths.aindexDir)
    const distDir = this.resolveAindexPath(options.aindex.commands.dist, resolvedPaths.aindexDir)

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
        localeExtensions: SourceLocaleExtensions,
        isDirectoryStructure: false,
        createPrompt: (content, locale, name, metadata) => this.createCommandPrompt(
          content,
          locale,
          name,
          distDir,
          ctx,
          metadata
        )
      }
    )

    logger.debug('CommandInputPlugin read complete', {
      commandCount: localizedCommands.length,
      errorCount: errors.length
    })

    for (const error of errors) logger.warn('Failed to read command', {path: error.path, phase: error.phase, error: error.error})

    const flatCommands: CommandPrompt[] = []
    for (const localized of localizedCommands) {
      const distContent = localized.dist
      if (distContent?.prompt != null) {
        const {prompt: distPrompt, rawMdx} = distContent
        flatCommands.push(rawMdx == null
          ? distPrompt
          : {...distPrompt, rawMdxContent: rawMdx})
        continue
      }

      const srcPrompt = localized.src.default.prompt
      if (srcPrompt != null) {
        const {rawMdx} = localized.src.default
        flatCommands.push(rawMdx == null
          ? srcPrompt
          : {...srcPrompt, rawMdxContent: rawMdx})
      }
    }

    logger.debug('CommandInputPlugin flattened commands', {
      count: flatCommands.length,
      commands: flatCommands.map(c => c.commandName)
    })

    return {
      commands: flatCommands
    }
  }
}
