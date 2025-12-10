/**
 * Integration test for the new plugin system architecture
 * Tests Input plugins -> ClassificationService -> Output plugins flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPluginContext } from './PluginContext'
import { loadPluginConfig } from './config/ConfigLoader'
import { defaultPluginConfig } from './config/defaultConfig'
import { ClassificationService } from './services/ClassificationService'
import { createAindexInputPlugin } from '../plugins/AindexInputPlugin'
import { createRefInputPlugin } from '../plugins/RefInputPlugin'
import type { InputPlugin, InputBundle, InputType } from './types'

// Mock file system for testing
const mockFs = {
  readFile: vi.fn(),
  exists: vi.fn(),
  readdir: vi.fn(),
  ensureDir: vi.fn(),
  writeFile: vi.fn(),
}

// Mock paths
const mockPaths = {
  root: '/test',
  dist: '/test/dist',
  ref: '/test/ref',
  userHome: '/home/user',
  resolve: (...paths: string[]) => paths.join('/'),
  join: require('path').join,
  dirname: require('path').dirname,
  basename: require('path').basename,
  relative: require('path').relative,
}

describe('Plugin System Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Input Plugin and ClassificationService Integration', () => {
    it('should scan and classify input bundles correctly', async () => {
      // Setup file system mocks
      mockFs.exists.mockResolvedValue(true)
      mockFs.readdir.mockResolvedValue([
        { name: 'GLOBAL.md', isDirectory: () => false },
        { name: 'commands', isDirectory: () => true },
        { name: 'agents', isDirectory: () => true },
      ])
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('GLOBAL.md')) {
          return Promise.resolve('# Global Prompt')
        }
        if (path.includes('commands/test.md')) {
          return Promise.resolve('# Test Command')
        }
        if (path.includes('agents/TestAgent.md')) {
          return Promise.resolve('# Test Agent')
        }
        return Promise.resolve('# Content')
      })

      // Create plugin context
      const ctx = createPluginContext({
        root: '/test',
        config: { plugins: [], options: {} },
        systemConfig: defaultPluginConfig,
      })

      // Override fs and paths with mocks
      ;(ctx as any).fs = mockFs
      ;(ctx as any).paths = mockPaths

      // Create classification service
      const classificationService = new ClassificationService(defaultPluginConfig)

      // Create and run AindexInputPlugin
      const aindexPlugin = createAindexInputPlugin({
        distDir: '/test/dist',
      })

      const bundles = await aindexPlugin.scan(ctx)
      expect(bundles).toHaveLength(3)

      // Classify bundles
      const classifiedBundles = classificationService.classifyBundles(bundles)

      // Verify classifications
      const globalBundle = classifiedBundles.find(b => b.path.includes('GLOBAL.md'))
      expect(globalBundle?.type).toBe(InputType.CONFIG_FILE) // Will be classified later

      const commandBundle = classifiedBundles.find(b => b.path.includes('commands'))
      expect(commandBundle?.type).toBe(InputType.CONFIG_FILE) // Will be classified later

      const agentBundle = classifiedBundles.find(b => b.path.includes('agents'))
      expect(agentBundle?.type).toBe(InputType.CONFIG_FILE) // Will be classified later

      // Test classification service directly
      const reclassified = classificationService.classifyBundle({
        type: InputType.CONFIG_FILE,
        path: '/test/dist/GLOBAL.md',
        content: '# Global Prompt',
        sourceProject: 'aindex',
      })
      expect(reclassified.type).toBe(InputType.GLOBAL_PROMPT)
    })

    it('should handle ref project classification', async () => {
      // Setup file system mocks for ref
      mockFs.exists.mockResolvedValue(true)
      mockFs.readdir.mockImplementation((path: string) => {
        if (path.includes('/test/ref')) {
          return Promise.resolve([
            { name: 'test-project', isDirectory: () => true },
          ])
        }
        if (path.includes('/test/ref/test-project')) {
          return Promise.resolve([
            { name: 'dist', isDirectory: () => true },
          ])
        }
        if (path.includes('/dist')) {
          return Promise.resolve([
            { name: 'AGENTS.md', isDirectory: () => false },
            { name: 'GLOBAL.md', isDirectory: () => false },
          ])
        }
        return Promise.resolve([])
      })
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('AGENTS.md')) {
          return Promise.resolve('# Agents')
        }
        if (path.includes('GLOBAL.md')) {
          return Promise.resolve('# Global')
        }
        return Promise.resolve('# Content')
      })

      // Create plugin context
      const ctx = createPluginContext({
        root: '/test',
        config: { plugins: [], options: {} },
        systemConfig: defaultPluginConfig,
      })

      // Override fs and paths with mocks
      ;(ctx as any).fs = mockFs
      ;(ctx as any).paths = mockPaths

      // Create classification service
      const classificationService = new ClassificationService(defaultPluginConfig)

      // Create and run RefInputPlugin
      const refPlugin = createRefInputPlugin({
        refDir: '/test/ref',
      })

      const bundles = await refPlugin.scan(ctx)
      expect(bundles).toHaveLength(2)

      // Test classification
      const classifiedBundles = classificationService.classifyBundles(bundles)

      const agentsBundle = classifiedBundles.find(b => b.path.includes('AGENTS.md'))
      expect(agentsBundle?.sourceProject).toBe('test-project')

      // Classify using service
      const classifiedAgents = classificationService.classifyBundle(agentsBundle!)
      expect(classifiedAgents.type).toBe(InputType.MEMORY_PROMPT)
    })
  })

  describe('Configuration System Integration', () => {
    it('should load and merge configuration correctly', async () => {
      const userConfig = {
        inputClassification: {
          rules: [
            {
              type: InputType.SUB_AGENT,
              patterns: ['custom-agents/**/*'],
              priority: 200,
            },
          ],
        },
        paths: {
          cursor: {
            outputDir: '.my-rules/',
          },
        },
      }

      const config = await loadPluginConfig(userConfig)

      expect(config.inputClassification.rules).toContainEqual(
        expect.objectContaining({
          type: InputType.SUB_AGENT,
          patterns: ['custom-agents/**/*'],
          priority: 200,
        })
      )

      expect(config.paths.cursor.outputDir).toBe('.my-rules/')
      expect(config.paths.kiro).toBeDefined() // Should retain defaults
    })

    it('should use classification rules from config', () => {
      const customConfig = {
        ...defaultPluginConfig,
        inputClassification: {
          rules: [
            {
              type: InputType.SKILL,
              patterns: ['*.skill'],
              priority: 100,
            },
          ],
          defaultType: InputType.CONFIG_FILE,
        },
      }

      const service = new ClassificationService(customConfig)

      const bundle = {
        type: InputType.CONFIG_FILE,
        path: 'test.skill',
        content: '# Skill',
      }

      const classified = service.classifyBundle(bundle)
      expect(classified.type).toBe(InputType.SKILL)
    })
  })

  describe('PluginContext Integration', () => {
    it('should provide systemConfig and classificationService', () => {
      const ctx = createPluginContext({
        root: '/test',
        config: { plugins: [], options: {} },
        systemConfig: defaultPluginConfig,
      })

      expect((ctx as any).systemConfig).toBeDefined()
      expect((ctx as any).classificationService).toBeDefined()
      expect((ctx as any).classificationService).toBeInstanceOf(ClassificationService)
    })

    it('should work without systemConfig', () => {
      const ctx = createPluginContext({
        root: '/test',
        config: { plugins: [], options: {} },
      })

      expect((ctx as any).systemConfig).toBeUndefined()
      expect((ctx as any).classificationService).toBeUndefined()
    })
  })
})