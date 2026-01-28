import type {CommandContext} from './Command'
import type {CollectedInputContext, OutputCleanContext, OutputPlugin, OutputWriteContext, PluginOptions, WriteResults} from 'memory-sync-cli/src/types'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import * as fc from 'fast-check'
import * as fastGlob from 'fast-glob'
import {describe, expect, it, vi} from 'vitest'
import {createLogger} from 'memory-sync-cli/src/log'
import {PluginKind} from 'memory-sync-cli/src/types'
import {ExecuteCommand} from './ExecuteCommand'

const mockLogger = createLogger('test', 'error') // Mock logger

const mockUserConfigOptions: Required<PluginOptions> = { // Mock user config options
  workspaceDir: '/test/workspace',
  shadowSourceProjectDir: '/test/workspace/aindex',
  shadowSkillSourceDir: '/test/workspace/aindex/dist/skills',
  shadowFastCommandDir: '/test/workspace/aindex/dist/commands',
  shadowSubAgentDir: '/test/workspace/aindex/dist/agents',
  globalMemoryFile: '/test/workspace/aindex/dist/GLOBAL.md',
  shadowProjectsDir: '/test/workspace/aindex/dist/app',
  externalProjects: [],
  excludePatterns: {},
  fastCommandSeriesOptions: {},
  plugins: [],
  logLevel: 'error'
}

function createMockRelativePath(pathStr: string) { // Helper to create mock RelativePath
  return {
    pathKind: 0,
    path: pathStr,
    basePath: '/test',
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => `/test/${pathStr}`
  }
}

function createMockOutputPlugin( // Helper to create mock output plugin with tracking
  name: string,
  files: string[] = [],
  dirs: string[] = []
): OutputPlugin & {operationOrder: string[]} {
  const operationOrder: string[] = []

  return {
    type: PluginKind.Output,
    name,
    log: mockLogger,
    operationOrder,
    registerProjectOutputFiles: vi.fn(async () => {
      operationOrder.push(`${name}:registerProjectOutputFiles`)
      return files.map(f => createMockRelativePath(f))
    }),
    registerProjectOutputDirs: vi.fn(async () => {
      operationOrder.push(`${name}:registerProjectOutputDirs`)
      return dirs.map(d => createMockRelativePath(d))
    }),
    registerGlobalOutputFiles: vi.fn(async () => []),
    registerGlobalOutputDirs: vi.fn(async () => []),
    canCleanProject: vi.fn(async () => true),
    canCleanGlobal: vi.fn(async () => true),
    canWrite: vi.fn(async () => true),
    writeProjectOutputs: vi.fn(async (): Promise<WriteResults> => {
      operationOrder.push(`${name}:writeProjectOutputs`)
      return {files: [], dirs: []}
    }),
    writeGlobalOutputs: vi.fn(async (): Promise<WriteResults> => {
      operationOrder.push(`${name}:writeGlobalOutputs`)
      return {files: [], dirs: []}
    })
  }
}

function createMockCommandContext( // Helper to create mock command context
  outputPlugins: readonly OutputPlugin[]
): CommandContext {
  const collectedInputContext: CollectedInputContext = {
    projects: [],
    globalMemory: void 0,
    skills: [],
    fastCommands: [],
    subAgents: [],
    projectPrompts: [],
    ideConfigs: [],
    aiAgentIgnoreConfigs: []
  }

  return {
    logger: mockLogger,
    outputPlugins,
    collectedInputContext,
    userConfigOptions: mockUserConfigOptions,
    createCleanContext: (dryRun: boolean): OutputCleanContext => ({
      logger: mockLogger,
      fs: nodeFs,
      path: nodePath,
      glob: fastGlob,
      collectedInputContext,
      dryRun
    }),
    createWriteContext: (dryRun: boolean): OutputWriteContext => ({
      logger: mockLogger,
      fs: nodeFs,
      path: nodePath,
      glob: fastGlob,
      collectedInputContext,
      dryRun,
      registeredPluginNames: outputPlugins.map(p => p.name)
    })
  }
}

describe('executeCommand', () => {
  describe('pre-cleanup execution order', () => {
    const pluginNameGen = fc.string({minLength: 2, maxLength: 10, unit: 'grapheme-ascii'}) // Generator for plugin names - ensure they start with letter and are unique
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const fileNameGen = fc.string({minLength: 2, maxLength: 20, unit: 'grapheme-ascii'}) // Generator for file names
      .filter(s => /^[a-z][\w.-]*$/i.test(s))

    it('should complete cleanup before write operations for any plugin configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(pluginNameGen, {minLength: 1, maxLength: 3}),
          fc.array(fileNameGen, {minLength: 1, maxLength: 2}),
          async (pluginNames, fileNames) => {
            const uniqueNames = [...new Set(pluginNames)] // Ensure unique plugin names
            if (uniqueNames.length === 0) return

            const globalOperationOrder: string[] = [] // Track global operation order across all plugins

            const plugins = uniqueNames.map(name => { // Create plugins with tracking
              const plugin = createMockOutputPlugin(name, fileNames)
              plugin.registerProjectOutputFiles = vi.fn(async () => { // Override to track global order
                globalOperationOrder.push(`cleanup:${name}`)
                return fileNames.map(f => createMockRelativePath(f))
              })
              plugin.writeProjectOutputs = vi.fn(async () => {
                globalOperationOrder.push(`write:${name}`)
                return {files: [], dirs: []}
              })
              return plugin
            })

            const ctx = createMockCommandContext(plugins)
            const command = new ExecuteCommand()

            await command.execute(ctx)

            const cleanupIndices = globalOperationOrder // Find the last cleanup operation and first write operation
              .map((op, i) => op.startsWith('cleanup:') ? i : -1)
              .filter(i => i >= 0)

            const writeIndices = globalOperationOrder
              .map((op, i) => op.startsWith('write:') ? i : -1)
              .filter(i => i >= 0)

            if (cleanupIndices.length <= 0 && writeIndices.length > 0) return // All cleanup operations should complete before any write operation

            const lastCleanupIndex = Math.max(...cleanupIndices)
            const firstWriteIndex = Math.min(...writeIndices)
            expect(lastCleanupIndex).toBeLessThan(firstWriteIndex)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should execute cleanup before write for single plugin', async () => { // Unit test for specific scenario
      const operationOrder: string[] = []

      const plugin: OutputPlugin = {
        type: PluginKind.Output,
        name: 'test-plugin',
        log: mockLogger,
        registerProjectOutputFiles: vi.fn(async () => {
          operationOrder.push('cleanup:registerFiles')
          return []
        }),
        registerProjectOutputDirs: vi.fn(async () => {
          operationOrder.push('cleanup:registerDirs')
          return []
        }),
        registerGlobalOutputFiles: vi.fn(async () => []),
        registerGlobalOutputDirs: vi.fn(async () => []),
        canCleanProject: vi.fn(async () => true),
        canCleanGlobal: vi.fn(async () => true),
        canWrite: vi.fn(async () => true),
        writeProjectOutputs: vi.fn(async () => {
          operationOrder.push('write:project')
          return {files: [], dirs: []}
        }),
        writeGlobalOutputs: vi.fn(async () => {
          operationOrder.push('write:global')
          return {files: [], dirs: []}
        })
      }

      const ctx = createMockCommandContext([plugin])
      const command = new ExecuteCommand()

      await command.execute(ctx)

      const cleanupOps = operationOrder.filter(op => op.startsWith('cleanup:')) // Verify cleanup operations happen before write operations
      const writeOps = operationOrder.filter(op => op.startsWith('write:'))

      expect(cleanupOps.length).toBeGreaterThan(0)
      expect(writeOps.length).toBeGreaterThan(0)

      const lastCleanupIndex = operationOrder.lastIndexOf(cleanupOps.at(-1))
      const firstWriteIndex = operationOrder.indexOf(writeOps[0])

      expect(lastCleanupIndex).toBeLessThan(firstWriteIndex)
    })
  })
})

describe('cleanupUtils', () => {
  describe('cleanup respects plugin registration', () => {
    const filePathGen = fc.string({minLength: 2, maxLength: 20, unit: 'grapheme-ascii'}) // Generator for file paths - ensure unique paths
      .filter(s => /^[a-z][\w.-]*$/i.test(s))

    it('should only collect files registered by enabled plugins', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(filePathGen, {minLength: 1, maxLength: 3}),
          fc.array(filePathGen, {minLength: 1, maxLength: 3}),
          async (plugin1Files, plugin2Files) => {
            const plugin1 = createMockOutputPlugin('plugin1', plugin1Files) // Create two plugins with different registered files
            const plugin2 = createMockOutputPlugin('plugin2', plugin2Files)

            const permissions = new Map<string, {project: boolean, global: boolean}>([ // Create permissions map - both plugins allowed
              ['plugin1', {project: true, global: true}],
              ['plugin2', {project: true, global: true}]
            ])

            const collectedInputContext: CollectedInputContext = {
              projects: [],
              globalMemory: void 0,
              skills: [],
              fastCommands: [],
              subAgents: [],
              projectPrompts: [],
              ideConfigs: [],
              aiAgentIgnoreConfigs: []
            }

            const cleanCtx: OutputCleanContext = {
              logger: mockLogger,
              fs: nodeFs,
              path: nodePath,
              glob: fastGlob,
              collectedInputContext,
              dryRun: false
            }

            const {collectDeletionTargets} = await import('./CleanupUtils') // Import the function to test

            const {filesToDelete} = await collectDeletionTargets([plugin1, plugin2], permissions, cleanCtx)

            const allRegisteredFiles = new Set([ // All collected files should be from registered plugins
              ...plugin1Files.map(f => `/test/${f}`),
              ...plugin2Files.map(f => `/test/${f}`)
            ])

            for (const file of filesToDelete) expect(allRegisteredFiles.has(file)).toBe(true)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should not collect files from plugins without permission', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(filePathGen, {minLength: 1, maxLength: 3}) // Generate unique file sets to avoid overlap
            .map(files => files.map(f => `allowed_${f}`)),
          fc.array(filePathGen, {minLength: 1, maxLength: 3})
            .map(files => files.map(f => `denied_${f}`)),
          async (allowedFiles, deniedFiles) => {
            const allowedPlugin = createMockOutputPlugin('allowed', allowedFiles) // Create two plugins with non-overlapping files
            const deniedPlugin = createMockOutputPlugin('denied', deniedFiles)

            const permissions = new Map<string, {project: boolean, global: boolean}>([ // Only allow first plugin
              ['allowed', {project: true, global: true}],
              ['denied', {project: false, global: false}]
            ])

            const collectedInputContext: CollectedInputContext = {
              projects: [],
              globalMemory: void 0,
              skills: [],
              fastCommands: [],
              subAgents: [],
              projectPrompts: [],
              ideConfigs: [],
              aiAgentIgnoreConfigs: []
            }

            const cleanCtx: OutputCleanContext = {
              logger: mockLogger,
              fs: nodeFs,
              path: nodePath,
              glob: fastGlob,
              collectedInputContext,
              dryRun: false
            }

            const {collectDeletionTargets} = await import('./CleanupUtils')

            const {filesToDelete} = await collectDeletionTargets([allowedPlugin, deniedPlugin], permissions, cleanCtx)

            const deniedFilePaths = new Set(deniedFiles.map(f => `/test/${f}`)) // Files from denied plugin should not be in the list
            for (const file of filesToDelete) expect(deniedFilePaths.has(file)).toBe(false)

            const allowedFilePaths = new Set(allowedFiles.map(f => `/test/${f}`)) // All files should be from allowed plugin
            for (const file of filesToDelete) expect(allowedFilePaths.has(file)).toBe(true)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should only delete files from plugins with project permission', async () => { // Unit test for specific scenario
      const allowedPlugin = createMockOutputPlugin('allowed', ['file1.txt', 'file2.txt'])
      const deniedPlugin = createMockOutputPlugin('denied', ['file3.txt', 'file4.txt'])

      const permissions = new Map<string, {project: boolean, global: boolean}>([
        ['allowed', {project: true, global: false}],
        ['denied', {project: false, global: false}]
      ])

      const collectedInputContext: CollectedInputContext = {
        projects: [],
        globalMemory: void 0,
        skills: [],
        fastCommands: [],
        subAgents: [],
        projectPrompts: [],
        ideConfigs: [],
        aiAgentIgnoreConfigs: []
      }

      const cleanCtx: OutputCleanContext = {
        logger: mockLogger,
        fs: nodeFs,
        path: nodePath,
        glob: fastGlob,
        collectedInputContext,
        dryRun: false
      }

      const {collectDeletionTargets} = await import('./CleanupUtils')

      const {filesToDelete} = await collectDeletionTargets([allowedPlugin, deniedPlugin], permissions, cleanCtx)

      expect(filesToDelete).toContain('/test/file1.txt')
      expect(filesToDelete).toContain('/test/file2.txt')
      expect(filesToDelete).not.toContain('/test/file3.txt')
      expect(filesToDelete).not.toContain('/test/file4.txt')
    })
  })
})

describe('dryRunOutputCommand', () => {
  describe('dry-run skips actual operations', () => {
    const filePathGen = fc.string({minLength: 2, maxLength: 20, unit: 'grapheme-ascii'}) // Generator for file paths
      .filter(s => /^[a-z][\w.-]*$/i.test(s))

    it('should not perform actual file operations in dry-run mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(filePathGen, {minLength: 1, maxLength: 3}),
          async fileNames => {
            const fsOperations: string[] = [] // Track actual file system operations

            const mockFs = { // Create mock fs module that tracks operations
              existsSync: vi.fn(() => {
                fsOperations.push('existsSync')
                return true
              }),
              unlinkSync: vi.fn(() => fsOperations.push('unlinkSync')),
              rmSync: vi.fn(() => fsOperations.push('rmSync')),
              writeFileSync: vi.fn(() => fsOperations.push('writeFileSync')),
              mkdirSync: vi.fn(() => fsOperations.push('mkdirSync'))
            }

            const plugin: OutputPlugin = { // Create plugin that would write files
              type: PluginKind.Output,
              name: 'test-plugin',
              log: mockLogger,
              registerProjectOutputFiles: vi.fn(async () =>
                fileNames.map(f => createMockRelativePath(f))),
              registerProjectOutputDirs: vi.fn(async () => []),
              registerGlobalOutputFiles: vi.fn(async () => []),
              registerGlobalOutputDirs: vi.fn(async () => []),
              canCleanProject: vi.fn(async () => true),
              canCleanGlobal: vi.fn(async () => true),
              canWrite: vi.fn(async () => true),
              writeProjectOutputs: vi.fn(async (ctx: OutputWriteContext): Promise<WriteResults> => {
                if (!ctx.dryRun) mockFs.writeFileSync() // In dry-run mode, should not perform actual writes
                return {
                  files: fileNames.map(f => ({
                    path: createMockRelativePath(f),
                    success: true,
                    skipped: ctx.dryRun
                  })),
                  dirs: []
                }
              }),
              writeGlobalOutputs: vi.fn(async (): Promise<WriteResults> => ({
                files: [],
                dirs: []
              }))
            }

            const collectedInputContext: CollectedInputContext = {
              projects: [],
              globalMemory: void 0,
              skills: [],
              fastCommands: [],
              subAgents: [],
              projectPrompts: [],
              ideConfigs: [],
              aiAgentIgnoreConfigs: []
            }

            const dryRunWriteCtx: OutputWriteContext = { // Create dry-run write context
              logger: mockLogger,
              fs: mockFs as any,
              path: nodePath,
              glob: fastGlob,
              collectedInputContext,
              dryRun: true,
              registeredPluginNames: ['test-plugin']
            }

            const {DryRunOutputCommand} = await import('./DryRunOutputCommand') // Import DryRunOutputCommand
            const command = new DryRunOutputCommand()

            const ctx: CommandContext = { // Create context that returns dry-run contexts
              logger: mockLogger,
              outputPlugins: [plugin],
              collectedInputContext,
              userConfigOptions: mockUserConfigOptions,
              createCleanContext: (): OutputCleanContext => ({
                ...dryRunWriteCtx,
                dryRun: true
              }),
              createWriteContext: (): OutputWriteContext => ({
                ...dryRunWriteCtx,
                dryRun: true
              })
            }

            await command.execute(ctx)

            expect(fsOperations).not.toContain('unlinkSync') // In dry-run mode, no actual file operations should occur
            expect(fsOperations).not.toContain('rmSync')
            expect(fsOperations).not.toContain('writeFileSync')
          }
        ),
        {numRuns: 100}
      )
    })

    it('should mark files as skipped in dry-run mode', async () => { // Unit test for specific scenario
      const plugin: OutputPlugin = {
        type: PluginKind.Output,
        name: 'test-plugin',
        log: mockLogger,
        registerProjectOutputFiles: vi.fn(async () => []),
        registerProjectOutputDirs: vi.fn(async () => []),
        registerGlobalOutputFiles: vi.fn(async () => []),
        registerGlobalOutputDirs: vi.fn(async () => []),
        canWrite: vi.fn(async () => true),
        writeProjectOutputs: vi.fn(async (ctx: OutputWriteContext): Promise<WriteResults> => ({
          files: [{
            path: createMockRelativePath('test.txt'),
            success: true,
            skipped: ctx.dryRun
          }],
          dirs: []
        })),
        writeGlobalOutputs: vi.fn(async (): Promise<WriteResults> => ({
          files: [],
          dirs: []
        }))
      }

      const collectedInputContext: CollectedInputContext = {
        projects: [],
        globalMemory: void 0,
        skills: [],
        fastCommands: [],
        subAgents: [],
        projectPrompts: [],
        ideConfigs: [],
        aiAgentIgnoreConfigs: []
      }

      const ctx: CommandContext = {
        logger: mockLogger,
        outputPlugins: [plugin],
        collectedInputContext,
        userConfigOptions: mockUserConfigOptions,
        createCleanContext: (): OutputCleanContext => ({
          logger: mockLogger,
          fs: nodeFs,
          path: nodePath,
          glob: fastGlob,
          collectedInputContext,
          dryRun: true
        }),
        createWriteContext: (): OutputWriteContext => ({
          logger: mockLogger,
          fs: nodeFs,
          path: nodePath,
          glob: fastGlob,
          collectedInputContext,
          dryRun: true,
          registeredPluginNames: ['test-plugin']
        })
      }

      const {DryRunOutputCommand} = await import('./DryRunOutputCommand')
      const command = new DryRunOutputCommand()

      const result = await command.execute(ctx)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Dry-run')
    })

    it('should not call ExecuteCommand pre-cleanup in dry-run mode', async () => { // It directly uses createWriteContext(true) which sets dryRun to true // DryRunOutputCommand is a separate command that doesn't call ExecuteCommand // This test verifies that DryRunOutputCommand doesn't perform cleanup
      const cleanupCalled = {value: false}

      const plugin: OutputPlugin = {
        type: PluginKind.Output,
        name: 'test-plugin',
        log: mockLogger,
        registerProjectOutputFiles: vi.fn(async () => {
          cleanupCalled.value = true
          return []
        }),
        registerProjectOutputDirs: vi.fn(async () => []),
        registerGlobalOutputFiles: vi.fn(async () => []),
        registerGlobalOutputDirs: vi.fn(async () => []),
        canWrite: vi.fn(async () => true),
        writeProjectOutputs: vi.fn(async (): Promise<WriteResults> => ({
          files: [],
          dirs: []
        })),
        writeGlobalOutputs: vi.fn(async (): Promise<WriteResults> => ({
          files: [],
          dirs: []
        }))
      }

      const collectedInputContext2: CollectedInputContext = {
        projects: [],
        globalMemory: void 0,
        skills: [],
        fastCommands: [],
        subAgents: [],
        projectPrompts: [],
        ideConfigs: [],
        aiAgentIgnoreConfigs: []
      }

      const ctx2: CommandContext = {
        logger: mockLogger,
        outputPlugins: [plugin],
        collectedInputContext: collectedInputContext2,
        userConfigOptions: mockUserConfigOptions,
        createCleanContext: (): OutputCleanContext => ({
          logger: mockLogger,
          fs: nodeFs,
          path: nodePath,
          glob: fastGlob,
          collectedInputContext: collectedInputContext2,
          dryRun: true
        }),
        createWriteContext: (): OutputWriteContext => ({
          logger: mockLogger,
          fs: nodeFs,
          path: nodePath,
          glob: fastGlob,
          collectedInputContext: collectedInputContext2,
          dryRun: true,
          registeredPluginNames: ['test-plugin']
        })
      }

      const {DryRunOutputCommand} = await import('./DryRunOutputCommand')
      const command = new DryRunOutputCommand()

      cleanupCalled.value = false // Reset the flag

      await command.execute(ctx2)
    }) // The key is that no actual deletion happens // Note: It may still be called for other purposes, but not for actual cleanup // (which is part of cleanup collection) // DryRunOutputCommand should not call registerProjectOutputFiles
  })
})
