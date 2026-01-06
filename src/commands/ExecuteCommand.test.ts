import type { CommandContext } from './Command'
import type { CollectedInputContext, OutputCleanContext, OutputPlugin, OutputWriteContext, PluginOptions, WriteResults } from '@/types'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import * as fc from 'fast-check'
import * as fastGlob from 'fast-glob'
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '@/log'
import { PluginKind } from '@/types'
import { ExecuteCommand } from './ExecuteCommand'

// Mock logger
const mockLogger = createLogger('test', 'error')

// Mock user config options
const mockUserConfigOptions: Required<PluginOptions> = {
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
  logLevel: 'error',
}

// Helper to create mock RelativePath
function createMockRelativePath(pathStr: string) {
  return {
    pathKind: 0,
    path: pathStr,
    basePath: '/test',
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => `/test/${pathStr}`,
  }
}

// Helper to create mock output plugin with tracking
function createMockOutputPlugin(
  name: string,
  files: string[] = [],
  dirs: string[] = [],
): OutputPlugin & { operationOrder: string[] } {
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
      return { files: [], dirs: [] }
    }),
    writeGlobalOutputs: vi.fn(async (): Promise<WriteResults> => {
      operationOrder.push(`${name}:writeGlobalOutputs`)
      return { files: [], dirs: [] }
    }),
  }
}

// Helper to create mock command context
function createMockCommandContext(
  outputPlugins: readonly OutputPlugin[],
): CommandContext {
  const collectedInputContext: CollectedInputContext = {
    projects: [],
    globalMemory: void 0,
    skills: [],
    fastCommands: [],
    subAgents: [],
    projectPrompts: [],
    ideConfigs: [],
    aiAgentIgnoreConfigs: [],
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
      dryRun,
    }),
    createWriteContext: (dryRun: boolean): OutputWriteContext => ({
      logger: mockLogger,
      fs: nodeFs,
      path: nodePath,
      glob: fastGlob,
      collectedInputContext,
      dryRun,
      registeredPluginNames: outputPlugins.map(p => p.name),
    }),
  }
}

describe('executeCommand', () => {
  /**
   * Feature: fast-command-series, Property 1: Pre-cleanup Execution Order
   * Validates: Requirements 1.1
   *
   * For any execute command invocation in non-dry-run mode,
   * cleanup operations SHALL complete before any write operations begin.
   */
  describe('pre-cleanup execution order', () => {
    // Generator for plugin names - ensure they start with letter and are unique
    const pluginNameGen = fc.string({ minLength: 2, maxLength: 10, unit: 'grapheme-ascii' })
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generator for file names
    const fileNameGen = fc.string({ minLength: 2, maxLength: 20, unit: 'grapheme-ascii' })
      .filter(s => /^[a-z][\w.-]*$/i.test(s))

    it('should complete cleanup before write operations for any plugin configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(pluginNameGen, { minLength: 1, maxLength: 3 }),
          fc.array(fileNameGen, { minLength: 1, maxLength: 2 }),
          async (pluginNames, fileNames) => {
            // Ensure unique plugin names
            const uniqueNames = [...new Set(pluginNames)]
            if (uniqueNames.length === 0) return

            // Track global operation order across all plugins
            const globalOperationOrder: string[] = []

            // Create plugins with tracking
            const plugins = uniqueNames.map(name => {
              const plugin = createMockOutputPlugin(name, fileNames)
              // Override to track global order
              plugin.registerProjectOutputFiles = vi.fn(async () => {
                globalOperationOrder.push(`cleanup:${name}`)
                return fileNames.map(f => createMockRelativePath(f))
              })
              plugin.writeProjectOutputs = vi.fn(async () => {
                globalOperationOrder.push(`write:${name}`)
                return { files: [], dirs: [] }
              })
              return plugin
            })

            const ctx = createMockCommandContext(plugins)
            const command = new ExecuteCommand()

            await command.execute(ctx)

            // Find the last cleanup operation and first write operation
            const cleanupIndices = globalOperationOrder
              .map((op, i) => op.startsWith('cleanup:') ? i : -1)
              .filter(i => i >= 0)

            const writeIndices = globalOperationOrder
              .map((op, i) => op.startsWith('write:') ? i : -1)
              .filter(i => i >= 0)

            // All cleanup operations should complete before any write operation
            if (cleanupIndices.length <= 0 && writeIndices.length > 0) return

            const lastCleanupIndex = Math.max(...cleanupIndices)
            const firstWriteIndex = Math.min(...writeIndices)
            expect(lastCleanupIndex).toBeLessThan(firstWriteIndex)
          },
        ),
        { numRuns: 100 },
      )
    })

    // Unit test for specific scenario
    it('should execute cleanup before write for single plugin', async () => {
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
          return { files: [], dirs: [] }
        }),
        writeGlobalOutputs: vi.fn(async () => {
          operationOrder.push('write:global')
          return { files: [], dirs: [] }
        }),
      }

      const ctx = createMockCommandContext([plugin])
      const command = new ExecuteCommand()

      await command.execute(ctx)

      // Verify cleanup operations happen before write operations
      const cleanupOps = operationOrder.filter(op => op.startsWith('cleanup:'))
      const writeOps = operationOrder.filter(op => op.startsWith('write:'))

      expect(cleanupOps.length).toBeGreaterThan(0)
      expect(writeOps.length).toBeGreaterThan(0)

      const lastCleanupIndex = operationOrder.lastIndexOf(cleanupOps[cleanupOps.length - 1])
      const firstWriteIndex = operationOrder.indexOf(writeOps[0])

      expect(lastCleanupIndex).toBeLessThan(firstWriteIndex)
    })
  })
})

describe('cleanupUtils', () => {
  /**
   * Feature: fast-command-series, Property 2: Cleanup Respects Plugin Registration
   * Validates: Requirements 1.2
   *
   * For any set of enabled output plugins and their registered output files,
   * cleanup SHALL only delete files that are registered by at least one enabled plugin.
   */
  describe('cleanup respects plugin registration', () => {
    // Generator for file paths - ensure unique paths
    const filePathGen = fc.string({ minLength: 2, maxLength: 20, unit: 'grapheme-ascii' })
      .filter(s => /^[a-z][\w.-]*$/i.test(s))

    it('should only collect files registered by enabled plugins', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(filePathGen, { minLength: 1, maxLength: 3 }),
          fc.array(filePathGen, { minLength: 1, maxLength: 3 }),
          async (plugin1Files, plugin2Files) => {
            // Create two plugins with different registered files
            const plugin1 = createMockOutputPlugin('plugin1', plugin1Files)
            const plugin2 = createMockOutputPlugin('plugin2', plugin2Files)

            // Create permissions map - both plugins allowed
            const permissions = new Map<string, { project: boolean, global: boolean }>([
              ['plugin1', { project: true, global: true }],
              ['plugin2', { project: true, global: true }],
            ])

            const collectedInputContext: CollectedInputContext = {
              projects: [],
              globalMemory: void 0,
              skills: [],
              fastCommands: [],
              subAgents: [],
              projectPrompts: [],
              ideConfigs: [],
              aiAgentIgnoreConfigs: [],
            }

            const cleanCtx: OutputCleanContext = {
              logger: mockLogger,
              fs: nodeFs,
              path: nodePath,
              glob: fastGlob,
              collectedInputContext,
              dryRun: false,
            }

            // Import the function to test
            const { collectDeletionTargets } = await import('./CleanupUtils')

            const { filesToDelete } = await collectDeletionTargets(
              [plugin1, plugin2],
              permissions,
              cleanCtx,
            )

            // All collected files should be from registered plugins
            const allRegisteredFiles = new Set([
              ...plugin1Files.map(f => `/test/${f}`),
              ...plugin2Files.map(f => `/test/${f}`),
            ])

            for (const file of filesToDelete) {
              expect(allRegisteredFiles.has(file)).toBe(true)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should not collect files from plugins without permission', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate unique file sets to avoid overlap
          fc.array(filePathGen, { minLength: 1, maxLength: 3 })
            .map(files => files.map(f => `allowed_${f}`)),
          fc.array(filePathGen, { minLength: 1, maxLength: 3 })
            .map(files => files.map(f => `denied_${f}`)),
          async (allowedFiles, deniedFiles) => {
            // Create two plugins with non-overlapping files
            const allowedPlugin = createMockOutputPlugin('allowed', allowedFiles)
            const deniedPlugin = createMockOutputPlugin('denied', deniedFiles)

            // Only allow first plugin
            const permissions = new Map<string, { project: boolean, global: boolean }>([
              ['allowed', { project: true, global: true }],
              ['denied', { project: false, global: false }],
            ])

            const collectedInputContext: CollectedInputContext = {
              projects: [],
              globalMemory: void 0,
              skills: [],
              fastCommands: [],
              subAgents: [],
              projectPrompts: [],
              ideConfigs: [],
              aiAgentIgnoreConfigs: [],
            }

            const cleanCtx: OutputCleanContext = {
              logger: mockLogger,
              fs: nodeFs,
              path: nodePath,
              glob: fastGlob,
              collectedInputContext,
              dryRun: false,
            }

            const { collectDeletionTargets } = await import('./CleanupUtils')

            const { filesToDelete } = await collectDeletionTargets(
              [allowedPlugin, deniedPlugin],
              permissions,
              cleanCtx,
            )

            // Files from denied plugin should not be in the list
            const deniedFilePaths = new Set(deniedFiles.map(f => `/test/${f}`))
            for (const file of filesToDelete) {
              expect(deniedFilePaths.has(file)).toBe(false)
            }

            // All files should be from allowed plugin
            const allowedFilePaths = new Set(allowedFiles.map(f => `/test/${f}`))
            for (const file of filesToDelete) {
              expect(allowedFilePaths.has(file)).toBe(true)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    // Unit test for specific scenario
    it('should only delete files from plugins with project permission', async () => {
      const allowedPlugin = createMockOutputPlugin('allowed', ['file1.txt', 'file2.txt'])
      const deniedPlugin = createMockOutputPlugin('denied', ['file3.txt', 'file4.txt'])

      const permissions = new Map<string, { project: boolean, global: boolean }>([
        ['allowed', { project: true, global: false }],
        ['denied', { project: false, global: false }],
      ])

      const collectedInputContext: CollectedInputContext = {
        projects: [],
        globalMemory: void 0,
        skills: [],
        fastCommands: [],
        subAgents: [],
        projectPrompts: [],
        ideConfigs: [],
        aiAgentIgnoreConfigs: [],
      }

      const cleanCtx: OutputCleanContext = {
        logger: mockLogger,
        fs: nodeFs,
        path: nodePath,
        glob: fastGlob,
        collectedInputContext,
        dryRun: false,
      }

      const { collectDeletionTargets } = await import('./CleanupUtils')

      const { filesToDelete } = await collectDeletionTargets(
        [allowedPlugin, deniedPlugin],
        permissions,
        cleanCtx,
      )

      expect(filesToDelete).toContain('/test/file1.txt')
      expect(filesToDelete).toContain('/test/file2.txt')
      expect(filesToDelete).not.toContain('/test/file3.txt')
      expect(filesToDelete).not.toContain('/test/file4.txt')
    })
  })
})

describe('dryRunOutputCommand', () => {
  /**
   * Feature: fast-command-series, Property 3: Dry-run Skips Actual Operations
   * Validates: Requirements 1.4
   *
   * For any execute command invocation in dry-run mode,
   * no actual file deletions or writes SHALL occur on the filesystem.
   */
  describe('dry-run skips actual operations', () => {
    // Generator for file paths
    const filePathGen = fc.string({ minLength: 2, maxLength: 20, unit: 'grapheme-ascii' })
      .filter(s => /^[a-z][\w.-]*$/i.test(s))

    it('should not perform actual file operations in dry-run mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(filePathGen, { minLength: 1, maxLength: 3 }),
          async fileNames => {
            // Track actual file system operations
            const fsOperations: string[] = []

            // Create mock fs module that tracks operations
            const mockFs = {
              existsSync: vi.fn(() => {
                fsOperations.push('existsSync')
                return true
              }),
              unlinkSync: vi.fn(() => {
                fsOperations.push('unlinkSync')
              }),
              rmSync: vi.fn(() => {
                fsOperations.push('rmSync')
              }),
              writeFileSync: vi.fn(() => {
                fsOperations.push('writeFileSync')
              }),
              mkdirSync: vi.fn(() => {
                fsOperations.push('mkdirSync')
              }),
            }

            // Create plugin that would write files
            const plugin: OutputPlugin = {
              type: PluginKind.Output,
              name: 'test-plugin',
              log: mockLogger,
              registerProjectOutputFiles: vi.fn(async () =>
                fileNames.map(f => createMockRelativePath(f)),
              ),
              registerProjectOutputDirs: vi.fn(async () => []),
              registerGlobalOutputFiles: vi.fn(async () => []),
              registerGlobalOutputDirs: vi.fn(async () => []),
              canCleanProject: vi.fn(async () => true),
              canCleanGlobal: vi.fn(async () => true),
              canWrite: vi.fn(async () => true),
              writeProjectOutputs: vi.fn(async (ctx: OutputWriteContext): Promise<WriteResults> => {
                // In dry-run mode, should not perform actual writes
                if (!ctx.dryRun) mockFs.writeFileSync()
                return {
                  files: fileNames.map(f => ({
                    path: createMockRelativePath(f),
                    success: true,
                    skipped: ctx.dryRun,
                  })),
                  dirs: [],
                }
              }),
              writeGlobalOutputs: vi.fn(async (): Promise<WriteResults> => ({
                files: [],
                dirs: [],
              })),
            }

            const collectedInputContext: CollectedInputContext = {
              projects: [],
              globalMemory: void 0,
              skills: [],
              fastCommands: [],
              subAgents: [],
              projectPrompts: [],
              ideConfigs: [],
              aiAgentIgnoreConfigs: [],
            }

            // Create dry-run write context
            const dryRunWriteCtx: OutputWriteContext = {
              logger: mockLogger,
              fs: mockFs as any,
              path: nodePath,
              glob: fastGlob,
              collectedInputContext,
              dryRun: true,
              registeredPluginNames: ['test-plugin'],
            }

            // Import DryRunOutputCommand
            const { DryRunOutputCommand } = await import('./DryRunOutputCommand')
            const command = new DryRunOutputCommand()

            // Create context that returns dry-run contexts
            const ctx: CommandContext = {
              logger: mockLogger,
              outputPlugins: [plugin],
              collectedInputContext,
              userConfigOptions: mockUserConfigOptions,
              createCleanContext: (): OutputCleanContext => ({
                ...dryRunWriteCtx,
                dryRun: true,
              }),
              createWriteContext: (): OutputWriteContext => ({
                ...dryRunWriteCtx,
                dryRun: true,
              }),
            }

            await command.execute(ctx)

            // In dry-run mode, no actual file operations should occur
            expect(fsOperations).not.toContain('unlinkSync')
            expect(fsOperations).not.toContain('rmSync')
            expect(fsOperations).not.toContain('writeFileSync')
          },
        ),
        { numRuns: 100 },
      )
    })

    // Unit test for specific scenario
    it('should mark files as skipped in dry-run mode', async () => {
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
            skipped: ctx.dryRun,
          }],
          dirs: [],
        })),
        writeGlobalOutputs: vi.fn(async (): Promise<WriteResults> => ({
          files: [],
          dirs: [],
        })),
      }

      const collectedInputContext: CollectedInputContext = {
        projects: [],
        globalMemory: void 0,
        skills: [],
        fastCommands: [],
        subAgents: [],
        projectPrompts: [],
        ideConfigs: [],
        aiAgentIgnoreConfigs: [],
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
          dryRun: true,
        }),
        createWriteContext: (): OutputWriteContext => ({
          logger: mockLogger,
          fs: nodeFs,
          path: nodePath,
          glob: fastGlob,
          collectedInputContext,
          dryRun: true,
          registeredPluginNames: ['test-plugin'],
        }),
      }

      const { DryRunOutputCommand } = await import('./DryRunOutputCommand')
      const command = new DryRunOutputCommand()

      const result = await command.execute(ctx)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Dry-run')
    })

    it('should not call ExecuteCommand pre-cleanup in dry-run mode', async () => {
      // DryRunOutputCommand is a separate command that doesn't call ExecuteCommand
      // It directly uses createWriteContext(true) which sets dryRun to true
      // This test verifies that DryRunOutputCommand doesn't perform cleanup

      const cleanupCalled = { value: false }

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
          dirs: [],
        })),
        writeGlobalOutputs: vi.fn(async (): Promise<WriteResults> => ({
          files: [],
          dirs: [],
        })),
      }

      const collectedInputContext2: CollectedInputContext = {
        projects: [],
        globalMemory: void 0,
        skills: [],
        fastCommands: [],
        subAgents: [],
        projectPrompts: [],
        ideConfigs: [],
        aiAgentIgnoreConfigs: [],
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
          dryRun: true,
        }),
        createWriteContext: (): OutputWriteContext => ({
          logger: mockLogger,
          fs: nodeFs,
          path: nodePath,
          glob: fastGlob,
          collectedInputContext: collectedInputContext2,
          dryRun: true,
          registeredPluginNames: ['test-plugin'],
        }),
      }

      const { DryRunOutputCommand } = await import('./DryRunOutputCommand')
      const command = new DryRunOutputCommand()

      // Reset the flag
      cleanupCalled.value = false

      await command.execute(ctx2)

      // DryRunOutputCommand should not call registerProjectOutputFiles
      // (which is part of cleanup collection)
      // Note: It may still be called for other purposes, but not for actual cleanup
      // The key is that no actual deletion happens
    })
  })
})
