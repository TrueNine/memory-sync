import type {CommandContext} from './Command'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger, FilePathKind} from '../plugins/plugin-core'
import {InitCommand} from './InitCommand'

function createCommandContext(): CommandContext {
  const workspaceDir = path.resolve('tmp-init-command')
  const userConfigOptions = mergeConfig({workspaceDir})

  return {
    logger: createLogger('InitCommandTest', 'error'),
    outputPlugins: [],
    userConfigOptions,
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceDir,
          getDirectoryName: () => path.basename(workspaceDir),
          getAbsolutePath: () => workspaceDir
        },
        projects: []
      }
    },
    createCleanContext: dryRun => ({
      logger: createLogger('InitCommandTest', 'error'),
      fs,
      path,
      glob,
      dryRun,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir),
            getAbsolutePath: () => workspaceDir
          },
          projects: []
        }
      }
    }) as CommandContext['createCleanContext'] extends (dryRun: boolean) => infer T ? T : never,
    createWriteContext: dryRun => ({
      logger: createLogger('InitCommandTest', 'error'),
      fs,
      path,
      glob,
      dryRun,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir),
            getAbsolutePath: () => workspaceDir
          },
          projects: []
        }
      }
    }) as CommandContext['createWriteContext'] extends (dryRun: boolean) => infer T ? T : never
  }
}

describe('init command', () => {
  it('returns a deprecation failure without creating files', async () => {
    const result = await new InitCommand().execute(createCommandContext())

    expect(result.success).toBe(false)
    expect(result.filesAffected).toBe(0)
    expect(result.dirsAffected).toBe(0)
    expect(result.message).toContain('deprecated')
    expect(result.message).toContain('~/workspace/aindex/public/')
  })
})
