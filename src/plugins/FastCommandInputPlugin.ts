import type { CollectedInputContext, FastCommandPrompt, FastCommandYAMLFrontMatter, InputPluginContext } from '@/types'

import { mdxToMd } from '@/compiler'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  MetadataValidationError,
  PromptKind,
  validateFastCommandMetadata,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

export interface SeriesInfo {
  readonly series?: string
  readonly commandName: string
}

export class FastCommandInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('FastCommandInputPlugin')
  }

  /**
   * Extract series prefix and command name from filename.
   * Series is the substring before the first underscore.
   * If no underscore exists, series is undefined and commandName is the entire basename.
   * @param fileName - The filename (e.g., 'pe_compile.md')
   * @returns SeriesInfo with optional series and required commandName
   */
  extractSeriesInfo(fileName: string): SeriesInfo {
    const baseName = fileName.replace(/\.mdx$/, '')
    const underscoreIndex = baseName.indexOf('_')

    if (underscoreIndex === -1) {
      return { commandName: baseName }
    }

    return {
      series: baseName.substring(0, underscoreIndex),
      commandName: baseName.substring(underscoreIndex + 1),
    }
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const { userConfigOptions: options, logger, globalScope } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const fastCommandDirRaw = options.shadowFastCommandDir
    const fastCommandDir = this.resolvePath(fastCommandDirRaw, workspaceDir, shadowProjectDir)

    const fastCommands: FastCommandPrompt[] = []
    if (ctx.fs.existsSync(fastCommandDir) && ctx.fs.statSync(fastCommandDir).isDirectory()) {
      const entries = ctx.fs.readdirSync(fastCommandDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.mdx')) {
          const filePath = ctx.path.join(fastCommandDir, entry.name)
          try {
            const rawContent = ctx.fs.readFileSync(filePath, 'utf-8')

            // Parse YAML front matter first for backward compatibility
            const parsed = parseMarkdown<FastCommandYAMLFrontMatter>(rawContent)

            // Compile MDX with globalScope and extract metadata from exports
            const compileResult = await mdxToMd(rawContent, {
              globalScope,
              extractMetadata: true,
              basePath: fastCommandDir,
            })

            // Merge YAML front matter with export metadata (export takes priority)
            const mergedFrontMatter: FastCommandYAMLFrontMatter | undefined = parsed.yamlFrontMatter != null || Object.keys(compileResult.metadata.fields).length > 0
              ? {
                  ...parsed.yamlFrontMatter,
                  ...compileResult.metadata.fields,
                } as FastCommandYAMLFrontMatter
              : void 0

            // Validate merged metadata (FastCommand has no required fields, but we still validate)
            if (mergedFrontMatter != null) {
              const validationResult = validateFastCommandMetadata(
                mergedFrontMatter as Record<string, unknown>,
                filePath,
              )

              // Log validation warnings
              for (const warning of validationResult.warnings) {
                logger.debug(warning)
              }

              // Throw error if validation fails
              if (!validationResult.valid) {
                throw new MetadataValidationError(validationResult.errors, filePath)
              }
            }

            // Use compiled content
            const content = compileResult.content
            const seriesInfo = this.extractSeriesInfo(entry.name)

            // Log metadata source for debugging
            logger.debug('fast command metadata extracted', {
              command: entry.name,
              source: compileResult.metadata.source,
              hasYaml: parsed.yamlFrontMatter != null,
              hasExport: Object.keys(compileResult.metadata.fields).length > 0,
            })

            fastCommands.push({
              type: PromptKind.FastCommand,
              content,
              length: content.length,
              filePathKind: FilePathKind.Relative,
              ...(mergedFrontMatter != null && { yamlFrontMatter: mergedFrontMatter }),
              ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
              markdownAst: parsed.markdownAst,
              markdownContents: parsed.markdownContents,
              dir: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: fastCommandDir,
                getDirectoryName: () => entry.name.replace(/\.mdx$/, ''),
                getAbsolutePath: () => filePath,
              },
              ...(seriesInfo.series != null && { series: seriesInfo.series }),
              commandName: seriesInfo.commandName,
            })
          } catch (e) {
            logger.error('failed to parse fast command', { file: filePath, error: e })
          }
        }
      }
    }

    return { fastCommands }
  }
}
