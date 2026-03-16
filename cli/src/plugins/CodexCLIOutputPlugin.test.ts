import type {CommandPrompt, InputPluginContext, OutputWriteContext} from './plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {CommandInputPlugin} from '../inputs/input-command'
import {CodexCLIOutputPlugin} from './CodexCLIOutputPlugin'
import {createLogger, FilePathKind} from './plugin-core'

class TestCodexCLIOutputPlugin extends CodexCLIOutputPlugin {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

function createInputContext(tempWorkspace: string): InputPluginContext {
  return {
    logger: createLogger('CodexCLIOutputPluginTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: mergeConfig({workspaceDir: tempWorkspace}),
    dependencyContext: {}
  } as InputPluginContext
}

function createWriteContext(
  tempWorkspace: string,
  commands: readonly CommandPrompt[]
): OutputWriteContext {
  return {
    logger: createLogger('CodexCLIOutputPluginTest', 'error'),
    fs,
    path,
    glob,
    dryRun: true,
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: tempWorkspace,
          getDirectoryName: () => path.basename(tempWorkspace)
        },
        projects: []
      },
      commands
    }
  } as OutputWriteContext
}

describe('codexCLIOutputPlugin command output', () => {
  it('renders codex commands from dist content instead of the zh source prompt', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-codex-command-'))
    const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-codex-home-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'commands', 'find')
    const distDir = path.join(tempWorkspace, 'aindex', 'dist', 'commands', 'find')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})

      fs.writeFileSync(path.join(srcDir, 'opensource.src.mdx'), [
        'export default {',
        '  description: \'中文源描述\',',
        '}',
        '',
        '中文源命令内容',
        ''
      ].join('\n'), 'utf8')
      fs.writeFileSync(path.join(distDir, 'opensource.mdx'), [
        'export default {',
        '  description: \'English dist description\',',
        '}',
        '',
        'English dist command body',
        ''
      ].join('\n'), 'utf8')

      const commandInputPlugin = new CommandInputPlugin()
      const collected = await commandInputPlugin.collect(createInputContext(tempWorkspace))
      const commands = collected.commands ?? []

      expect(commands).toHaveLength(1)

      const codexPlugin = new TestCodexCLIOutputPlugin(tempHomeDir)
      const writeCtx = createWriteContext(tempWorkspace, commands)
      const declarations = await codexPlugin.declareOutputFiles(writeCtx)
      const commandDeclaration = declarations.find(
        declaration => declaration.path.replaceAll('\\', '/').endsWith('/.codex/prompts/find-opensource.md')
      )

      expect(commandDeclaration).toBeDefined()

      const rendered = await codexPlugin.convertContent(commandDeclaration!, writeCtx)
      expect(String(rendered)).toContain('English dist description')
      expect(String(rendered)).toContain('English dist command body')
      expect(String(rendered)).not.toContain('中文源描述')
      expect(String(rendered)).not.toContain('中文源命令内容')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
      fs.rmSync(tempHomeDir, {recursive: true, force: true})
    }
  })
})
