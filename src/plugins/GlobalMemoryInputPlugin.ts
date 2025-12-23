import type { CollectedInputContext, InputPluginContext } from '@/types'

import * as os from 'node:os'

import {
  DEFAULT_GLOBAL_MEMORY_FILE,
} from '@/constants'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  GlobalConfigDirectoryType,
  PromptKind,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

export class GlobalMemoryInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GlobalMemoryInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, fs, path } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const globalMemoryFileRaw = options.globalMemoryFile ?? DEFAULT_GLOBAL_MEMORY_FILE
    const globalMemoryFile = this.resolvePath(globalMemoryFileRaw, workspaceDir, shadowProjectDir)

    if (fs.existsSync(globalMemoryFile) && fs.statSync(globalMemoryFile).isFile()) {
      const rawContent = fs.readFileSync(globalMemoryFile, 'utf-8')
      const parsed = parseMarkdown(rawContent)
      const content = parsed.contentWithoutFrontMatter
      return {
        globalMemory: {
          type: PromptKind.GlobalMemory,
          content,
          length: content.length,
          filePathKind: FilePathKind.Relative,
          ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
          markdownAst: parsed.markdownAst,
          markdownContents: parsed.markdownContents,
          dir: {
            pathKind: FilePathKind.Relative,
            path: path.basename(globalMemoryFile),
            basePath: path.dirname(globalMemoryFile),
            getDirectoryName: () => path.basename(globalMemoryFile),
            getAbsolutePath: () => globalMemoryFile,
          },
          parentDirectoryPath: {
            type: GlobalConfigDirectoryType.UserHome,
            directory: {
              pathKind: FilePathKind.Relative,
              path: '',
              basePath: os.homedir(),
              getDirectoryName: () => path.basename(os.homedir()),
              getAbsolutePath: () => os.homedir(),
            },
          },
        },
      }
    }

    return {}
  }
}
