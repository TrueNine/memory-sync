import type {InputCapabilityContext, InputCollectedContext} from '../plugins/plugin-core'

import * as os from 'node:os'
import process from 'node:process'

import {mdxToMd} from '@truenine/md-compiler'
import {CompilerDiagnosticError, ScopeError} from '@truenine/md-compiler/errors'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {
  buildConfigDiagnostic,
  buildPathStateDiagnostic,
  buildPromptCompilerDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {AbstractInputCapability, FilePathKind, GlobalConfigDirectoryType, PromptKind} from '../plugins/plugin-core'
import {assertNoResidualModuleSyntax} from '../plugins/plugin-core/DistPromptGuards'
import {formatPromptCompilerDiagnostic} from '../plugins/plugin-core/PromptCompilerDiagnostics'

export class GlobalMemoryInputCapability extends AbstractInputCapability {
  constructor() {
    super('GlobalMemoryInputCapability')
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, fs, path, globalScope} = ctx
    const {aindexDir} = this.resolveBasePaths(options)

    const globalMemoryFile = this.resolveAindexPath(options.aindex.globalPrompt.dist, aindexDir)

    if (!fs.existsSync(globalMemoryFile)) {
      this.log.warn(buildPathStateDiagnostic({
        code: 'GLOBAL_MEMORY_PROMPT_MISSING',
        title: 'Global memory prompt is missing',
        path: globalMemoryFile,
        expectedKind: 'compiled global memory prompt file',
        actualState: 'path does not exist'
      }))
      return {}
    }

    if (!fs.statSync(globalMemoryFile).isFile()) {
      this.log.warn(buildPathStateDiagnostic({
        code: 'GLOBAL_MEMORY_PROMPT_NOT_FILE',
        title: 'Global memory prompt path is not a file',
        path: globalMemoryFile,
        expectedKind: 'compiled global memory prompt file',
        actualState: 'path exists but is not a regular file'
      }))
      return {}
    }

    const rawContent = fs.readFileSync(globalMemoryFile, 'utf8')
    const parsed = parseMarkdown(rawContent)

    let compiledContent: string
    try {
      const compileResult = await mdxToMd(rawContent, {
        ...globalScope != null && {globalScope},
        extractMetadata: true,
        basePath: path.dirname(globalMemoryFile),
        filePath: globalMemoryFile
      })
      compiledContent = compileResult.content
      assertNoResidualModuleSyntax(compiledContent, globalMemoryFile)
    }
    catch (e) {
      if (e instanceof CompilerDiagnosticError) {
        this.log.error(buildPromptCompilerDiagnostic({
          code: 'GLOBAL_MEMORY_PROMPT_COMPILE_FAILED',
          title: 'Failed to compile global memory prompt',
          diagnosticText: formatPromptCompilerDiagnostic(e, {
            operation: 'Failed to compile global memory prompt.',
            promptKind: 'global-memory',
            logicalName: 'global-memory',
            distPath: globalMemoryFile
          }),
          details: {
            promptKind: 'global-memory',
            distPath: globalMemoryFile
          }
        }))
        if (e instanceof ScopeError) {
          this.log.error(buildConfigDiagnostic({
            code: 'GLOBAL_MEMORY_SCOPE_VARIABLES_MISSING',
            title: 'Global memory prompt references missing config variables',
            reason: diagnosticLines(
              'The global memory prompt uses scope variables that are not defined in `~/.aindex/.tnmsc.json`.'
            ),
            configPath: '~/.aindex/.tnmsc.json',
            exactFix: diagnosticLines(
              'Add the missing variables to `~/.aindex/.tnmsc.json` and rerun tnmsc.'
            ),
            possibleFixes: [
              diagnosticLines('If you reference `{profile.name}`, define `profile.name` in the config file.')
            ],
            details: {
              promptPath: globalMemoryFile,
              errorMessage: e.message
            }
          }))
        }
        process.exit(1)
      }
      throw e
    }

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
