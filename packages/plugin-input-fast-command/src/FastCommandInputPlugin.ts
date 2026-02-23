import type {ParsedMarkdown} from '@truenine/md-compiler/markdown'
import type {
  CollectedInputContext,
  FastCommandPrompt,
  FastCommandYAMLFrontMatter,
  InputPluginContext,
  MetadataValidationResult,
  PluginOptions,
  ResolvedBasePaths
} from '@truenine/plugin-shared'
import {mdxToMd} from '@truenine/md-compiler'
import {MetadataValidationError} from '@truenine/md-compiler/errors'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {BaseDirectoryInputPlugin} from '@truenine/plugin-input-shared'
import {
  FilePathKind,
  PromptKind,
  validateFastCommandMetadata
} from '@truenine/plugin-shared'

export interface SeriesInfo {
  readonly series?: string
  readonly commandName: string
}

export class FastCommandInputPlugin extends BaseDirectoryInputPlugin<FastCommandPrompt, FastCommandYAMLFrontMatter> {
  constructor() {
    super('FastCommandInputPlugin', {configKey: 'shadowSourceProject.fastCommand.dist'})
  }

  protected getTargetDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    return this.resolveShadowPath(options.shadowSourceProject.fastCommand.dist, resolvedPaths.shadowProjectDir)
  }

  protected validateMetadata(metadata: Record<string, unknown>, filePath: string): MetadataValidationResult {
    return validateFastCommandMetadata(metadata, filePath)
  }

  protected createResult(items: FastCommandPrompt[]): Partial<CollectedInputContext> {
    return {fastCommands: items}
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
    const {userConfigOptions: options, logger, path, fs} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const targetDir = this.getTargetDir(options, resolvedPaths)
    const items: FastCommandPrompt[] = []

    if (!(fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory())) return this.createResult(items)

    try {
      const entries = fs.readdirSync(targetDir, {withFileTypes: true})
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(this.extension)) {
          const prompt = await this.processFile(entry.name, path.join(targetDir, entry.name), targetDir, void 0, ctx)
          if (prompt != null) items.push(prompt)
        } else if (entry.isDirectory()) {
          const subDirPath = path.join(targetDir, entry.name)
          try {
            const subEntries = fs.readdirSync(subDirPath, {withFileTypes: true})
            for (const subEntry of subEntries) {
              if (subEntry.isFile() && subEntry.name.endsWith(this.extension)) {
                const prompt = await this.processFile(subEntry.name, path.join(subDirPath, subEntry.name), targetDir, entry.name, ctx)
                if (prompt != null) items.push(prompt)
              }
            }
          } catch (e) {
            logger.error(`Failed to scan subdirectory at ${subDirPath}`, {error: e})
          }
        }
      }
    } catch (e) {
      logger.error(`Failed to scan directory at ${targetDir}`, {error: e})
    }

    return this.createResult(items)
  }

  private async processFile(
    fileName: string,
    filePath: string,
    baseDir: string,
    parentDirName: string | undefined,
    ctx: InputPluginContext
  ): Promise<FastCommandPrompt | undefined> {
    const {logger, globalScope} = ctx
    const rawContent = ctx.fs.readFileSync(filePath, 'utf8')

    try {
      const parsed = parseMarkdown<FastCommandYAMLFrontMatter>(rawContent)

      const compileResult = await mdxToMd(rawContent, {
        globalScope,
        extractMetadata: true,
        basePath: parentDirName != null ? ctx.path.join(baseDir, parentDirName) : baseDir
      })

      const mergedFrontMatter: FastCommandYAMLFrontMatter | undefined = parsed.yamlFrontMatter != null || Object.keys(compileResult.metadata.fields).length > 0
        ? {
            ...parsed.yamlFrontMatter,
            ...compileResult.metadata.fields
          } as FastCommandYAMLFrontMatter
        : void 0

      if (mergedFrontMatter != null) {
        const validationResult = this.validateMetadata(mergedFrontMatter as Record<string, unknown>, filePath)

        for (const warning of validationResult.warnings) logger.debug(warning)

        if (!validationResult.valid) throw new MetadataValidationError([...validationResult.errors], filePath)
      }

      const {content} = compileResult

      const entryName = parentDirName != null ? `${parentDirName}/${fileName}` : fileName

      logger.debug(`${this.name} metadata extracted`, {
        file: entryName,
        source: compileResult.metadata.source,
        hasYaml: parsed.yamlFrontMatter != null,
        hasExport: Object.keys(compileResult.metadata.fields).length > 0
      })

      return this.createPrompt(
        entryName,
        filePath,
        content,
        mergedFrontMatter,
        parsed.rawFrontMatter,
        parsed,
        baseDir,
        rawContent
      )
    } catch (e) {
      logger.error(`failed to parse ${this.name} item`, {file: filePath, error: e})
      return void 0
    }
  }

  protected createPrompt(
    entryName: string,
    filePath: string,
    content: string,
    yamlFrontMatter: FastCommandYAMLFrontMatter | undefined,
    rawFrontMatter: string | undefined,
    parsed: ParsedMarkdown<FastCommandYAMLFrontMatter>,
    baseDir: string,
    rawContent: string
  ): FastCommandPrompt {
    const slashIndex = entryName.indexOf('/')
    const parentDirName = slashIndex !== -1 ? entryName.slice(0, slashIndex) : void 0
    const fileName = slashIndex !== -1 ? entryName.slice(slashIndex + 1) : entryName

    const seriesInfo = this.extractSeriesInfo(fileName, parentDirName)
    const seriName = yamlFrontMatter?.seriName

    return {
      type: PromptKind.FastCommand,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      ...yamlFrontMatter != null && {yamlFrontMatter},
      ...rawFrontMatter != null && {rawFrontMatter},
      markdownAst: parsed.markdownAst,
      markdownContents: parsed.markdownContents,
      dir: {
        pathKind: FilePathKind.Relative,
        path: entryName,
        basePath: baseDir,
        getDirectoryName: () => entryName.replace(/\.mdx$/, ''),
        getAbsolutePath: () => filePath
      },
      ...seriesInfo.series != null && {series: seriesInfo.series},
      commandName: seriesInfo.commandName,
      ...seriName != null && {seriName},
      rawMdxContent: rawContent
    }
  }
}
