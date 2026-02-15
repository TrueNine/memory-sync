import type {ParsedMarkdown} from '@truenine/md-compiler/markdown'
import type {
  CollectedInputContext,
  InputPluginContext,
  PluginOptions,
  ResolvedBasePaths,
  YAMLFrontMatter
} from '@/types'
import {mdxToMd} from '@truenine/md-compiler'
import {MetadataValidationError} from '@truenine/md-compiler/errors'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Configuration options for BaseDirectoryInputPlugin
 */
export interface DirectoryInputPluginOptions {
  readonly configKey: keyof ResolvedBasePaths | string

  readonly extension?: string
}

/**
 * Abstract base class for input plugins that scan a directory for MDX files.
 * Provides common logic for:
 * - Directoy scanning
 * - File reading
 * - MDX compilation
 * - Metadata validation
 * - Error handling
 */
export abstract class BaseDirectoryInputPlugin<
  TPrompt extends {
    type: string
    content: string
    yamlFrontMatter?: TYAML
    rawFrontMatter?: string
    dir: {path: string, basePath: string}
  },
  TYAML extends YAMLFrontMatter
> extends AbstractInputPlugin {
  protected readonly configKey: string
  protected readonly extension: string

  constructor(name: string, options: DirectoryInputPluginOptions) {
    super(name)
    this.configKey = options.configKey
    this.extension = options.extension ?? '.mdx'
  }

  protected abstract validateMetadata(metadata: Record<string, unknown>, filePath: string): {
    valid: boolean
    errors: readonly string[]
    warnings: readonly string[]
  }

  protected abstract getTargetDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string

  protected abstract createPrompt(
    entryName: string,
    filePath: string,
    content: string,
    yamlFrontMatter: TYAML | undefined,
    rawFrontMatter: string | undefined,
    parsed: ParsedMarkdown<TYAML>,
    baseDir: string,
    rawContent: string
  ): TPrompt

  protected abstract createResult(items: TPrompt[]): Partial<CollectedInputContext>

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const targetDir = this.getTargetDir(options, resolvedPaths)
    const items: TPrompt[] = []

    if (!(fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory())) return this.createResult(items)

    try {
      const entries = fs.readdirSync(targetDir, {withFileTypes: true})
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(this.extension)) {
          const filePath = path.join(targetDir, entry.name)
          const rawContent = fs.readFileSync(filePath, 'utf8')

          try {
            const parsed = parseMarkdown<TYAML>(rawContent) // Parse YAML front matter first for backward compatibility

            const compileResult = await mdxToMd(rawContent, { // Compile MDX with globalScope and extract metadata from exports
              globalScope,
              extractMetadata: true,
              basePath: targetDir
            })

            const mergedFrontMatter: TYAML | undefined = parsed.yamlFrontMatter != null || Object.keys(compileResult.metadata.fields).length > 0 // Merge YAML front matter with export metadata (export takes priority)
              ? {
                  ...parsed.yamlFrontMatter,
                  ...compileResult.metadata.fields
                } as TYAML
              : void 0

            if (mergedFrontMatter != null) {
              const validationResult = this.validateMetadata(mergedFrontMatter as Record<string, unknown>, filePath)

              for (const warning of validationResult.warnings) logger.debug(warning)

              if (!validationResult.valid) throw new MetadataValidationError([...validationResult.errors], filePath)
            }

            const {content} = compileResult

            logger.debug(`${this.name} metadata extracted`, {
              file: entry.name,
              source: compileResult.metadata.source,
              hasYaml: parsed.yamlFrontMatter != null,
              hasExport: Object.keys(compileResult.metadata.fields).length > 0
            })

            const prompt = this.createPrompt(
              entry.name,
              filePath,
              content,
              mergedFrontMatter,
              parsed.rawFrontMatter,
              parsed,
              targetDir,
              rawContent
            )

            items.push(prompt)
          } catch (e) {
            logger.error(`failed to parse ${this.name} item`, {file: filePath, error: e})
          }
        }
      }
    } catch (e) {
      logger.error(`Failed to scan directory at ${targetDir}`, {error: e})
    }

    return this.createResult(items)
  }
}
