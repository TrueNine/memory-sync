import type {InputCapabilityContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it, vi} from 'vitest'
import {mergeConfig} from '../config'
import {AindexInputCapability} from './input-aindex'

function createLoggerMock(): {
  readonly logger: InputCapabilityContext['logger']
  readonly warn: ReturnType<typeof vi.fn>
} {
  const warn = vi.fn()

  return {
    logger: {
      error: vi.fn(),
      warn,
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn()
    },
    warn
  }
}

function createContext(
  tempWorkspace: string,
  logger: InputCapabilityContext['logger']
): InputCapabilityContext {
  return {
    logger,
    fs,
    path,
    glob,
    userConfigOptions: mergeConfig({workspaceDir: tempWorkspace}),
    dependencyContext: {}
  } as InputCapabilityContext
}

function createAindexProject(tempWorkspace: string, projectName: string): {
  readonly configDir: string
} {
  const distProjectDir = path.join(tempWorkspace, 'aindex', 'dist', 'app', projectName)
  const configDir = path.join(tempWorkspace, 'aindex', 'app', projectName)

  fs.mkdirSync(distProjectDir, {recursive: true})
  fs.mkdirSync(configDir, {recursive: true})

  return {configDir}
}

describe('aindex input capability project config loading', () => {
  it('loads project.json5 using JSON5 features without any jsonc fallback', () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-aindex-project-json5-'))
    const {logger, warn} = createLoggerMock()

    try {
      const {configDir} = createAindexProject(tempWorkspace, 'project-a')
      fs.writeFileSync(path.join(configDir, 'project.json5'), [
        '{',
        '  // JSON5 comment support',
        '  includeSeries: [\'alpha\'],',
        '  subSeries: {',
        '    skills: [\'ship-*\'],',
        '  },',
        '}',
        ''
      ].join('\n'), 'utf8')

      const result = new AindexInputCapability().collect(createContext(tempWorkspace, logger))
      const project = result.workspace?.projects[0]

      expect(project?.name).toBe('project-a')
      expect(project?.projectConfig).toEqual({
        includeSeries: ['alpha'],
        subSeries: {
          skills: ['ship-*']
        }
      })
      expect(warn).not.toHaveBeenCalled()
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('ignores legacy project.jsonc after the hard cut', () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-aindex-project-jsonc-legacy-'))
    const {logger, warn} = createLoggerMock()

    try {
      const {configDir} = createAindexProject(tempWorkspace, 'project-b')
      fs.writeFileSync(path.join(configDir, 'project.jsonc'), '{"includeSeries":["legacy"]}\n', 'utf8')

      const result = new AindexInputCapability().collect(createContext(tempWorkspace, logger))
      const project = result.workspace?.projects[0]

      expect(project?.name).toBe('project-b')
      expect(project?.projectConfig).toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('emits JSON5 diagnostics for invalid project.json5 syntax', () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-aindex-project-json5-invalid-'))
    const {logger, warn} = createLoggerMock()

    try {
      const {configDir} = createAindexProject(tempWorkspace, 'project-c')
      fs.writeFileSync(path.join(configDir, 'project.json5'), '{includeSeries: [\'broken\',]} trailing', 'utf8')

      const result = new AindexInputCapability().collect(createContext(tempWorkspace, logger))
      const project = result.workspace?.projects[0]
      const diagnostic = warn.mock.calls[0]?.[0]

      expect(project?.name).toBe('project-c')
      expect(project?.projectConfig).toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(diagnostic).toEqual(expect.objectContaining({
        code: 'AINDEX_PROJECT_JSON5_INVALID',
        title: 'Failed to parse project.json5 for project-c',
        exactFix: ['Fix the JSON5 syntax in project.json5 and rerun tnmsc.']
      }))
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
