/**
 * Property-based tests for KiroPowersRegistryWriter
 *
 * Feature: plugin-side-effects
 * Property 6: Registry Reset to Official State
 *
 * After executing the clean effect, the registry shall be reset to the official
 * Kiro powers registry state (from build-time constant or empty fallback).
 *
 * Validates: Requirements 6.1, 6.2
 */

import type {
  KiroPowerEntry,
  KiroPowersRegistry,
  KiroRepoSource,
} from '@/types/RegistryTypes'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import * as fc from 'fast-check'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {KiroPowersRegistryWriter} from './KiroPowersRegistryWriter'

/**
 * Test subclass that allows setting a custom registry path for testing.
 */
class TestableKiroPowersRegistryWriter extends KiroPowersRegistryWriter {
  private readonly testRegistryPath: string

  constructor(testRegistryPath: string) {
    super()
    this.testRegistryPath = testRegistryPath
    ; (this as any).registryPath = testRegistryPath // Override the registry path using reflection
  }
}

/**
 * Generators for property-based testing
 */

const powerNameGen = fc.string({minLength: 1, maxLength: 30, unit: 'grapheme-ascii'}) // Generator for valid power names (alphanumeric with hyphens)
  .filter(s => /^[a-z][a-z0-9-]*$/i.test(s))

const descriptionGen = fc.string({minLength: 1, maxLength: 100}) // Generator for descriptions

const keywordsGen = fc.array( // Generator for keywords
  fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}).filter(s => /^[a-z0-9]+$/i.test(s)),
  {minLength: 0, maxLength: 5},
)

const validDateGen = fc.integer({ // Using integer timestamps to ensure valid dates // Generator for valid dates (constrained to avoid invalid date values)
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-12-31').getTime(),
}).map(timestamp => new Date(timestamp))

const localPowerEntryGen = fc.record({ // Generator for local power entries (source.repoId starts with 'local-')
  name: powerNameGen,
  description: descriptionGen,
  keywords: keywordsGen,
  installed: fc.constant(true),
  installedAt: validDateGen.map(d => d.toISOString()),
  installPath: fc.string({minLength: 1, maxLength: 50}).map(s => `/test/path/${s}`),
  source: fc.record({
    type: fc.constant('repo' as const),
    repoId: fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z0-9]+$/i.test(s))
      .map(s => `local-${s}`), // Ensure repoId starts with 'local-'
    repoName: fc.string({minLength: 1, maxLength: 30}),
  }),
  sourcePath: fc.string({minLength: 1, maxLength: 50}).map(s => `/test/source/${s}`),
}) as fc.Arbitrary<KiroPowerEntry>

const localRepoSourceGen = fc.record({ // Generator for local repoSource entries (type === 'local')
  name: fc.string({minLength: 1, maxLength: 50}),
  type: fc.constant('local' as const),
  enabled: fc.boolean(),
  addedAt: validDateGen.map(d => d.toISOString()),
  powerCount: fc.nat({max: 10}),
  path: fc.string({minLength: 1, maxLength: 50}).map(s => `/test/${s}`),
  lastSync: validDateGen.map(d => d.toISOString()),
}) as fc.Arbitrary<KiroRepoSource>

const repoSourceIdGen = fc.string({minLength: 1, maxLength: 30, unit: 'grapheme-ascii'}) // Generator for repoSource ID
  .filter(s => /^[a-z0-9-]+$/i.test(s))

describe('kiroPowersRegistryWriter Property Tests', () => {
  let tempDir: string,
    registryPath: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-registry-test-')) // Create a unique temp directory for each test
    registryPath = path.join(tempDir, 'registry.json')
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true}) // Clean up temp directory
  })

  /**
   * Feature: plugin-side-effects, Property 6: Registry Reset to Official State
   * Validates: Requirements 6.1, 6.2
   *
   * After cleanup, the registry should be reset to official state
   * (empty in test environment since __KIRO_GLOBAL_POWERS_REGISTRY__ is not defined)
   */
  describe('property 6: Registry Reset to Official State', () => {
    it('should reset registry to official state after cleanup (empty in tests)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(localPowerEntryGen, {minLength: 1, maxLength: 5}), // Generate 0-5 local powers
          async localPowers => {
            const uniqueLocalPowers = localPowers.map((p, i) => ({ // Ensure unique names by adding index suffix
              ...p,
              name: `${p.name}-local-${i}`,
            }))

            const powers: Record<string, KiroPowerEntry> = {} // Build initial registry with local powers
            for (const power of uniqueLocalPowers) powers[power.name] = power

            const initialRegistry: KiroPowersRegistry = {
              version: '1.0.0',
              powers,
              repoSources: {},
              lastUpdated: new Date().toISOString(),
            }

            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2)) // Write initial registry to disk

            const writer = new TestableKiroPowersRegistryWriter(registryPath) // Create writer and execute cleanup
            const result = writer.unregisterLocalPowers(false)

            expect(result).toBe(true)

            const cleanedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as KiroPowersRegistry // Read cleaned registry

            expect(cleanedRegistry.version).toBe('1.0.0') // since __KIRO_GLOBAL_POWERS_REGISTRY__ is not defined // In test environment, should reset to empty registry (fallback)
            expect(Object.keys(cleanedRegistry.powers).length).toBe(0)
            expect(Object.keys(cleanedRegistry.repoSources).length).toBe(0)
            expect(cleanedRegistry.lastUpdated).toBeDefined()
          },
        ),
        {numRuns: 50},
      )
    })

    it('should reset registry and clear all repoSources after cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array( // Generate 0-5 local repoSources
            fc.tuple(repoSourceIdGen, localRepoSourceGen),
            {minLength: 1, maxLength: 5},
          ),
          async localSources => {
            const uniqueLocalSources = localSources.map(([id, source], i) => [ // Ensure unique IDs by adding suffix
              `${id}-local-${i}`,
              source,
            ] as const)

            const repoSources: Record<string, KiroRepoSource> = {} // Build initial registry with local repoSources
            for (const [id, source] of uniqueLocalSources) repoSources[id] = source

            const initialRegistry: KiroPowersRegistry = {
              version: '1.0.0',
              powers: {},
              repoSources,
              lastUpdated: new Date().toISOString(),
            }

            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2)) // Write initial registry to disk

            const writer = new TestableKiroPowersRegistryWriter(registryPath) // Create writer and execute cleanup
            const result = writer.unregisterLocalPowers(false)

            expect(result).toBe(true)

            const cleanedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as KiroPowersRegistry // Read cleaned registry

            expect(Object.keys(cleanedRegistry.repoSources).length).toBe(0) // All repoSources should be cleared (reset to official state)
          },
        ),
        {numRuns: 50},
      )
    })

    it('should preserve registry structure after cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(localPowerEntryGen, {minLength: 1, maxLength: 3}),
          async localPowers => {
            const uniqueLocalPowers = localPowers.map((p, i) => ({ // Ensure unique names
              ...p,
              name: `${p.name}-${i}`,
            }))

            const powers: Record<string, KiroPowerEntry> = {}
            for (const power of uniqueLocalPowers) powers[power.name] = power

            const initialRegistry: KiroPowersRegistry = {
              version: '2.0.0',
              powers,
              repoSources: {},
              kiroRecommendedRepo: {
                url: 'https://example.com/repo',
                lastFetch: new Date().toISOString(),
                powerCount: 42,
              },
              lastUpdated: new Date().toISOString(),
            }

            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2)) // Write and cleanup
            const writer = new TestableKiroPowersRegistryWriter(registryPath)
            writer.unregisterLocalPowers(false)

            const cleanedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as KiroPowersRegistry // Read cleaned registry

            expect(cleanedRegistry.version).toBeDefined() // Verify structure is valid (reset to official state)
            expect(cleanedRegistry.powers).toBeDefined()
            expect(cleanedRegistry.repoSources).toBeDefined()
            expect(cleanedRegistry.lastUpdated).toBeDefined()
          },
        ),
        {numRuns: 50},
      )
    })

    it('should succeed when registry file does not exist', async () => {
      if (fs.existsSync(registryPath)) fs.unlinkSync(registryPath) // Ensure registry file does not exist

      const writer = new TestableKiroPowersRegistryWriter(registryPath)
      const result = writer.unregisterLocalPowers(false)

      expect(result).toBe(true) // Should succeed without error (Requirement 6.4)

      expect(fs.existsSync(registryPath)).toBe(true) // Registry file should be created with official state
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as KiroPowersRegistry
      expect(registry.version).toBe('1.0.0')
    })

    it('should not modify registry in dry-run mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(localPowerEntryGen, {minLength: 1, maxLength: 3}),
          async localPowers => {
            const uniqueLocalPowers = localPowers.map((p, i) => ({ // Ensure unique names
              ...p,
              name: `${p.name}-${i}`,
            }))

            const powers: Record<string, KiroPowerEntry> = {}
            for (const power of uniqueLocalPowers) powers[power.name] = power

            const initialRegistry: KiroPowersRegistry = {
              version: '1.0.0',
              powers,
              repoSources: {},
              lastUpdated: new Date().toISOString(),
            }

            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2)) // Write initial registry
            const originalContent = fs.readFileSync(registryPath, 'utf8')

            const writer = new TestableKiroPowersRegistryWriter(registryPath) // Execute cleanup in dry-run mode
            const result = writer.unregisterLocalPowers(true) // dry-run = true

            expect(result).toBe(true)

            const afterContent = fs.readFileSync(registryPath, 'utf8') // Verify file was not modified
            expect(afterContent).toBe(originalContent)
          },
        ),
        {numRuns: 50},
      )
    })
  })
})
