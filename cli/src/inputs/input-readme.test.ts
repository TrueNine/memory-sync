import type {InputCapabilityContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it, vi} from 'vitest'
import {mergeConfig} from '../config'
import {ReadmeMdInputCapability} from './input-readme'

function createContext(tempWorkspace: string, logger: InputCapabilityContext['logger']): InputCapabilityContext {
  return {
    logger,
    fs,
    path,
    glob,
    userConfigOptions: mergeConfig({workspaceDir: tempWorkspace}),
    dependencyContext: {}
  } as InputCapabilityContext
}

describe('readme input capability project series validation', () => {
  it('fails fast when app, ext, and arch reuse the same project name', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-readme-series-conflict-'))
    const error = vi.fn()
    const logger = {
      error,
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn()
    } as InputCapabilityContext['logger']

    try {
      fs.mkdirSync(path.join(tempWorkspace, 'aindex', 'app', 'project-a'), {recursive: true})
      fs.mkdirSync(path.join(tempWorkspace, 'aindex', 'ext', 'project-a'), {recursive: true})

      await expect(new ReadmeMdInputCapability().collect(createContext(tempWorkspace, logger)))
        .rejects
        .toThrow('Readme project series name conflict')
      expect(error).toHaveBeenCalledWith(expect.objectContaining({
        code: 'README_PROJECT_SERIES_NAME_CONFLICT'
      }))
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
