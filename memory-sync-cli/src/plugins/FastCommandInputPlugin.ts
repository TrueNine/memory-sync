import type {ParsedMarkdown} from 'memory-sync-cli/src/markdown'
import type {
  CollectedInputContext,
  FastCommandPrompt,
  FastCommandYAMLFrontMatter,
  MetadataValidationResult,
  PluginOptions,
  ResolvedBasePaths
} from 'memory-sync-cli/src/types'
import {
  FilePathKind,
  PromptKind,
  validateFastCommandMetadata
} from 'memory-sync-cli/src/types'
import {BaseDirectoryInputPlugin} from './BaseDirectoryInputPlugin'

export interface SeriesInfo {
  readonly series?: string
  readonly commandName: string
}

export class FastCommandInputPlugin extends BaseDirectoryInputPlugin<FastCommandPrompt, FastCommandYAMLFrontMatter> {
  constructor() {
    super('FastCommandInputPlugin', {configKey: 'shadowFastCommandDir'})
  }

  protected getTargetDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    const raw = options.shadowFastCommandDir
    const {workspaceDir, shadowProjectDir} = resolvedPaths
    return this.resolvePath(raw, workspaceDir, shadowProjectDir)
  }

  protected validateMetadata(metadata: Record<string, unknown>, filePath: string): MetadataValidationResult {
    return validateFastCommandMetadata(metadata, filePath)
  }

  protected createResult(items: FastCommandPrompt[]): Partial<CollectedInputContext> {
    return {fastCommands: items}
  }

  extractSeriesInfo(fileName: string): SeriesInfo {
    const baseName = fileName.replace(/\.mdx$/, '')
    const underscoreIndex = baseName.indexOf('_')

    if (underscoreIndex === -1) return {commandName: baseName}

    return {
      series: baseName.slice(0, Math.max(0, underscoreIndex)),
      commandName: baseName.slice(Math.max(0, underscoreIndex + 1))
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
    const seriesInfo = this.extractSeriesInfo(entryName)

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
      rawMdxContent: rawContent
    }
  }
}
