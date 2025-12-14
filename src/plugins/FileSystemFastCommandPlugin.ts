import type { Logger } from '@/log'
import type { CollectedInputContext, FastCommandPrompt, FastCommandYAMLFrontMatter, InputPlugin, InputPluginContext } from '@/types'

import { DEFAULT_SHADOW_FAST_COMMAND_DIR } from '@/constants'
import { createLogger } from '@/log'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  PluginKind,
  PromptKind,
} from '@/types'
import { resolveBasePaths, resolvePath } from '@/utils/pathUtils'

export class FileSystemFastCommandPlugin implements InputPlugin {
  readonly type = PluginKind.Input
  readonly name = 'FileSystemFastCommandPlugin'
  readonly log: Logger

  constructor() {
    this.log = createLogger(this.name)
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger } = ctx
    const { workspaceDir, shadowProjectDir } = resolveBasePaths(options)

    const fastCommandDirRaw = options.shadowFastCommandDir ?? DEFAULT_SHADOW_FAST_COMMAND_DIR
    const fastCommandDir = resolvePath(fastCommandDirRaw, workspaceDir, shadowProjectDir)

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
