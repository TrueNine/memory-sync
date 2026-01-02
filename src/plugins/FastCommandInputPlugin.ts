import type { CollectedInputContext, FastCommandPrompt, FastCommandYAMLFrontMatter, InputPluginContext } from '@/types'

import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  PromptKind,
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
    const baseName = fileName.replace(/\.md$/, '')
    const underscoreIndex = baseName.indexOf('_')

    if (underscoreIndex === -1) {
      return { commandName: baseName }
    }

    return {
      series: baseName.substring(0, underscoreIndex),
      commandName: baseName.substring(underscoreIndex + 1),
    }
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const fastCommandDirRaw = options.shadowFastCommandDir
    const fastCommandDir = this.resolvePath(fastCommandDirRaw, workspaceDir, shadowProjectDir)

    const fastCommands: FastCommandPrompt[] = []
    if (ctx.fs.existsSync(fastCommandDir) && ctx.fs.statSync(fastCommandDir).isDirectory()) {
      try {
        const entries = ctx.fs.readdirSync(fastCommandDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            const filePath = ctx.path.join(fastCommandDir, entry.name)
            const rawContent = ctx.fs.readFileSync(filePath, 'utf-8')
            const parsed = parseMarkdown<FastCommandYAMLFrontMatter>(rawContent)
            const content = parsed.contentWithoutFrontMatter
            const seriesInfo = this.extractSeriesInfo(entry.name)
            fastCommands.push({
              type: PromptKind.FastCommand,
              content,
              length: content.length,
              filePathKind: FilePathKind.Relative,
              ...(parsed.yamlFrontMatter != null && { yamlFrontMatter: parsed.yamlFrontMatter }),
              ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
              markdownAst: parsed.markdownAst,
              markdownContents: parsed.markdownContents,
              dir: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: fastCommandDir,
                getDirectoryName: () => entry.name.replace(/\.md$/, ''),
                getAbsolutePath: () => filePath,
              },
              ...(seriesInfo.series != null && { series: seriesInfo.series }),
              commandName: seriesInfo.commandName,
            })
          }
        }
      } catch (e) {
        logger.error(`Failed to scan fast commands at ${fastCommandDir}`, { error: e })
      }
    }

    return { fastCommands }
  }
}
