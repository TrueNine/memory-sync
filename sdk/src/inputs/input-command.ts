import type {
  CommandPrompt,
  CommandYAMLFrontMatter,
  InputCapabilityContext,
  InputCollectedContext,
  Locale
} from '../plugins/plugin-core'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {
  AbstractInputCapability,
  createLocalizedPromptReader,
  FilePathKind,
  PromptKind,
  SourceLocaleExtensions,
  validateCommandMetadata

} from '../plugins/plugin-core'

export class CommandInputCapability extends AbstractInputCapability {
  constructor() {
    super('CommandInputCapability')
  }

  private createCommandPrompt(
    content: string,
    _locale: Locale,
    name: string,
    distDir: string,
    ctx: InputCapabilityContext,
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

    const validation = validateCommandMetadata(yamlFrontMatter as Record<string, unknown>, filePath)
    if (!validation.valid) throw new Error(validation.errors.join('\n'))

    Object.assign(prompt, {yamlFrontMatter})
    if (yamlFrontMatter.seriName != null) Object.assign(prompt, {seriName: yamlFrontMatter.seriName})
    if (yamlFrontMatter.scope === 'global') Object.assign(prompt, {globalOnly: true})
    return prompt
  }

  override async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveAindexPath(options.aindex.commands.src, resolvedPaths.aindexDir)
    const distDir = this.resolveAindexPath(options.aindex.commands.dist, resolvedPaths.aindexDir)

    logger.debug('CommandInputCapability collecting', {
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
        hydrateSourceContents: false,
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

    logger.debug('CommandInputCapability read complete', {
      commandCount: localizedCommands.length,
      errorCount: errors.length
    })

    for (const error of errors) {
      logger.warn(buildFileOperationDiagnostic({
        code: 'COMMAND_PROMPT_READ_FAILED',
        title: 'Failed to read command prompt',
        operation: error.phase === 'scan' ? 'scan' : 'read',
        targetKind: 'command prompt',
        path: error.path,
        error: error.error,
        details: {
          phase: error.phase
        }
      }))
    }

    if (errors.length > 0) throw new Error(errors.map(error => error.error instanceof Error ? error.error.message : String(error.error)).join('\n'))

    const flatCommands: CommandPrompt[] = []
    for (const localized of localizedCommands) {
      const distContent = localized.dist
      if (distContent?.prompt == null) continue

      const {prompt: distPrompt, rawMdx} = distContent
      flatCommands.push(rawMdx == null
        ? distPrompt
        : {...distPrompt, rawMdxContent: rawMdx})
    }

    logger.debug('CommandInputCapability flattened commands', {
      count: flatCommands.length,
      commands: flatCommands.map(c => c.commandName)
    })

    return {
      commands: flatCommands
    }
  }
}
