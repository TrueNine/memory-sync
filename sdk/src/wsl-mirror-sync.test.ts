import type {OutputAdaptor, OutputWriteContext} from './adaptors/adaptor-core'
import {describe, expect, it} from 'vitest'
import {AdaptorKind} from './adaptors/adaptor-core'
import {collectDeclaredWslMirrorFiles} from './wsl-mirror-sync'

interface RecordedLogger {
  readonly infoMessages: string[]
  trace: () => void
  debug: () => void
  info: (message: unknown) => void
  warn: () => void
  error: () => void
  fatal: () => void
}

function createLogger(): RecordedLogger {
  const infoMessages: string[] = []
  return {
    trace: () => {},
    debug: () => {},
    info: (message: unknown) => {
      infoMessages.push(String(message))
    },
    warn: () => {},
    error: () => {},
    fatal: () => {},
    infoMessages
  }
}

function createMirrorPlugin(
  sourcePaths: string | readonly string[] = [],
  pluginName: string = 'MirrorPlugin'
): OutputAdaptor {
  const normalizedPaths = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths]

  return {
    type: AdaptorKind.Output,
    name: pluginName,
    log: createLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return []
    },
    async convertContent() {
      return ''
    },
    async declareWslMirrorFiles() {
      return normalizedPaths
        .filter(sourcePath => sourcePath.length > 0)
        .map(sourcePath => ({sourcePath}))
    }
  }
}

function createWriteContext(instances?: string | string[]): OutputWriteContext {
  return {
    logger: createLogger(),
    dryRun: false,
    runtimeTargets: {
      jetbrainsCodexDirs: []
    },
    pluginOptions: {
      windows: {
        wsl2: {
          instances
        }
      }
    },
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: 'absolute',
          path: 'C:\\workspace',
          getDirectoryName: () => 'workspace'
        },
        projects: []
      }
    }
  } as unknown as OutputWriteContext
}

describe('wsl mirror sync', () => {
  it('skips declared WSL mirror files for opt-in plugins that are not enabled', async () => {
    const declarations = await collectDeclaredWslMirrorFiles(
      [createMirrorPlugin('~/.claude/settings.json', 'ClaudeCodeCLIOutputAdaptor')],
      {
        ...createWriteContext('Ubuntu'),
        pluginOptions: {
          windows: {
            wsl2: {
              instances: 'Ubuntu'
            }
          },
          plugins: {}
        }
      } as OutputWriteContext
    )

    expect(declarations).toEqual([])
  })

  it('collects declared WSL mirror files after an opt-in plugin is explicitly enabled', async () => {
    const declarations = await collectDeclaredWslMirrorFiles(
      [createMirrorPlugin('~/.claude/settings.json', 'ClaudeCodeCLIOutputAdaptor')],
      {
        ...createWriteContext('Ubuntu'),
        pluginOptions: {
          windows: {
            wsl2: {
              instances: 'Ubuntu'
            }
          },
          plugins: {
            claudeCode: true
          }
        }
      } as OutputWriteContext
    )

    expect(declarations).toEqual([{sourcePath: '~/.claude/settings.json'}])
  })
})
