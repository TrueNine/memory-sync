import type {
  CollectedInputContext,
  InputPluginContext,
  MetadataValidationResult,
  PluginOptions,
  ResolvedBasePaths,
  RulePrompt,
  RuleScope,
  RuleYAMLFrontMatter
} from '@/types'
import {mdxToMd} from '@truenine/md-compiler'
import {MetadataValidationError} from '@truenine/md-compiler/errors'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {
  FilePathKind,
  PromptKind,
  validateRuleMetadata
} from '@/types'
import {BaseDirectoryInputPlugin} from './BaseDirectoryInputPlugin'

export class RuleInputPlugin extends BaseDirectoryInputPlugin<RulePrompt, RuleYAMLFrontMatter> {
  constructor() {
    super('RuleInputPlugin', {configKey: 'shadowSourceProject.rule.dist'})
  }

  protected getTargetDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    return this.resolveShadowPath(options.shadowSourceProject.rule.dist, resolvedPaths.shadowProjectDir)
  }

  protected validateMetadata(metadata: Record<string, unknown>, filePath: string): MetadataValidationResult {
    return validateRuleMetadata(metadata, filePath)
  }

  protected createResult(items: RulePrompt[]): Partial<CollectedInputContext> {
    return {rules: items}
  }

  protected createPrompt(
    entryName: string,
    filePath: string,
    content: string,
    yamlFrontMatter: RuleYAMLFrontMatter | undefined,
    rawFrontMatter: string | undefined,
    parsed: {markdownAst?: unknown, markdownContents: readonly unknown[]},
    baseDir: string,
    rawContent: string
  ): RulePrompt {
    const slashIndex = entryName.indexOf('/')
    const series = slashIndex !== -1 ? entryName.slice(0, slashIndex) : ''
    const fileName = slashIndex !== -1 ? entryName.slice(slashIndex + 1) : entryName
    const ruleName = fileName.replace(/\.mdx$/, '')

    const globs: readonly string[] = yamlFrontMatter?.globs ?? []
    const scope: RuleScope = yamlFrontMatter?.scope ?? 'project'

    return {
      type: PromptKind.Rule,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      ...yamlFrontMatter != null && {yamlFrontMatter},
      ...rawFrontMatter != null && {rawFrontMatter},
      markdownAst: parsed.markdownAst as never,
      markdownContents: parsed.markdownContents as never,
      dir: {
        pathKind: FilePathKind.Relative,
        path: entryName,
        basePath: baseDir,
        getDirectoryName: () => entryName.replace(/\.mdx$/, ''),
        getAbsolutePath: () => filePath
      },
      series,
      ruleName,
      globs,
      scope,
      rawMdxContent: rawContent
    }
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, path, fs} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const targetDir = this.getTargetDir(options, resolvedPaths)
    const items: RulePrompt[] = []

    if (!(fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory())) return this.createResult(items)

    try {
      const entries = fs.readdirSync(targetDir, {withFileTypes: true})
      for (const entry of entries) {
        if (entry.isDirectory()) {
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
    parentDirName: string,
    ctx: InputPluginContext
  ): Promise<RulePrompt | undefined> {
    const {logger, globalScope} = ctx
    const rawContent = ctx.fs.readFileSync(filePath, 'utf8')

    try {
      const parsed = parseMarkdown<RuleYAMLFrontMatter>(rawContent)

      const compileResult = await mdxToMd(rawContent, {
        globalScope,
        extractMetadata: true,
        basePath: ctx.path.join(baseDir, parentDirName)
      })

      const mergedFrontMatter: RuleYAMLFrontMatter | undefined = parsed.yamlFrontMatter != null || Object.keys(compileResult.metadata.fields).length > 0
        ? {
            ...parsed.yamlFrontMatter,
            ...compileResult.metadata.fields
          } as RuleYAMLFrontMatter
        : void 0

      if (mergedFrontMatter != null) {
        const validationResult = this.validateMetadata(mergedFrontMatter as Record<string, unknown>, filePath)

        for (const warning of validationResult.warnings) logger.debug(warning)

        if (!validationResult.valid) throw new MetadataValidationError([...validationResult.errors], filePath)
      }

      const {content} = compileResult

      const entryName = `${parentDirName}/${fileName}`

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
}
