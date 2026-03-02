import type {CollectedInputContext, InputPluginContext} from '@truenine/plugin-shared'

import * as os from 'node:os'
import process from 'node:process'

import {mdxToMd} from '@truenine/md-compiler'
import {ScopeError} from '@truenine/md-compiler/errors'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {
  FilePathKind,
  GlobalConfigDirectoryType,
  PromptKind
} from '@truenine/plugin-shared'

export class GlobalMemoryInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GlobalMemoryInputPlugin')
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, fs, path, globalScope} = ctx
    const {aindexDir} = this.resolveBasePaths(options)

    const globalMemoryFile = this.resolveAindexPath(options.aindex.globalPrompt.dist, aindexDir)

    if (!fs.existsSync(globalMemoryFile)) {
      this.log.warn({action: 'collect', reason: 'fileNotFound', path: globalMemoryFile})
      return {}
    }

    if (!fs.statSync(globalMemoryFile).isFile()) {
      this.log.warn({action: 'collect', reason: 'notAFile', path: globalMemoryFile})
      return {}
    }

    const rawContent = fs.readFileSync(globalMemoryFile, 'utf8')
    const parsed = parseMarkdown(rawContent)

    let compiledContent: string
    if (globalScope != null) {
      try {
        compiledContent = await mdxToMd(rawContent, {globalScope, basePath: path.dirname(globalMemoryFile)})
      }
      catch (e) {
        if (e instanceof ScopeError) {
          this.log.error(`MDX compilation failed: ${e.message}`)
          this.log.error(`Please check your configuration file (~/.aindex/.tnmsc.json) and ensure all required variables are defined.`)
          this.log.error(`For example, if using {profile.name}, add a "profile" section with "name" field to your config.`)
          process.exit(1)
        }
        throw e
      }
    } else compiledContent = parsed.contentWithoutFrontMatter

    this.log.debug({action: 'collect', path: globalMemoryFile, contentLength: compiledContent.length})

    return {
      globalMemory: {
        type: PromptKind.GlobalMemory,
        content: compiledContent,
        length: compiledContent.length,
        filePathKind: FilePathKind.Relative,
        ...parsed.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
        markdownAst: parsed.markdownAst,
        markdownContents: parsed.markdownContents,
        dir: {
          pathKind: FilePathKind.Relative,
          path: path.basename(globalMemoryFile),
          basePath: path.dirname(globalMemoryFile),
          getDirectoryName: () => path.basename(globalMemoryFile),
          getAbsolutePath: () => globalMemoryFile
        },
        parentDirectoryPath: {
          type: GlobalConfigDirectoryType.UserHome,
          directory: {
            pathKind: FilePathKind.Relative,
            path: '',
            basePath: os.homedir(),
            getDirectoryName: () => path.basename(os.homedir()),
            getAbsolutePath: () => os.homedir()
          }
        }
      }
    }
  }
}
