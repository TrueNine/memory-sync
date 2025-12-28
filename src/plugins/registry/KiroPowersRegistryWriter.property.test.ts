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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { KiroPowersRegistryWriter } from './KiroPowersRegistryWriter'

/**
 * Test subclass that allows setting a custom registry path for testing.
 */
class TestableKiroPowersRegistryWriter extends KiroPowersRegistryWriter {
  private readonly testRegistryPath: string

  constructor(testRegistryPath: string) {
    super()
    this.testRegistryPath = testRegistryPath
    // Override the registry path using reflection
    ; (this as any).registryPath = testRegistryPath
  }
}

/**
 * Generators for property-based testing
 */

// Generator for valid power names (alphanumeric with hyphens)
const powerNameGen = fc.string({ minLength: 1, maxLength: 30, unit: 'grapheme-ascii' })
  .filter((s) => /^[a-z][a-z0-9-]*$/i.test(s))

// Generator for descriptions
const descriptionGen = fc.string({ minLength: 1, maxLength: 100 })

// Generator for keywords
const keywordsGen = fc.array(
  fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' }).filter((s) => /^[a-z0-9]+$/i.test(s)),
  { minLength: 0, maxLength: 5 },
)

// Generator for valid dates (constrained to avoid invalid date values)
// Using integer timestamps to ensure valid dates
const validDateGen = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-12-31').getTime(),
}).map((timestamp) => new Date(timestamp))

// Generator for local power entries (source.repoId starts with 'local-')
const localPowerEntryGen = fc.record({
  name: powerNameGen,
  description: descriptionGen,
  keywords: keywordsGen,
  installed: fc.constant(true),
  installedAt: validDateGen.map((d) => d.toISOString()),
  installPath: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/test/path/${s}`),
  source: fc.record({
    type: fc.constant('repo' as const),
    repoId: fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
      .filter((s) => /^[a-z0-9]+$/i.test(s))
      // Ensure repoId starts with 'local-'
      .map((s) => `local-${s}`),
    repoName: fc.string({ minLength: 1, maxLength: 30 }),
  }),
  sourcePath: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/test/source/${s}`),
}) as fc.Arbitrary<KiroPowerEntry>

// Generator for local repoSource entries (type === 'local')
const localRepoSourceGen = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  type: fc.constant('local' as const),
  enabled: fc.boolean(),
  addedAt: validDateGen.map((d) => d.toISOString()),
  powerCount: fc.nat({ max: 10 }),
  path: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/test/${s}`),
  lastSync: validDateGen.map((d) => d.toISOString()),
}) as fc.Arbitrary<KiroRepoSource>

// Generator for repoSource ID
const repoSourceIdGen = fc.string({ minLength: 1, maxLength: 30, unit: 'grapheme-ascii' })
  .filter((s) => /^[a-z0-9-]+$/i.test(s))

describe('kiroPowersRegistryWriter Property Tests', () => {
  let tempDir: string
  let registryPath: string

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-registry-test-'))
    registryPath = path.join(tempDir, 'registry.json')
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
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
          // Generate 0-5 local powers
          fc.array(localPowerEntryGen, { minLength: 1, maxLength: 5 }),
          async (localPowers) => {
            // Ensure unique names by adding index suffix
            const uniqueLocalPowers = localPowers.map((p, i) => ({
              ...p,
              name: `${p.name}-local-${i}`,
            }))

            // Build initial registry with local powers
            const powers: Record<string, KiroPowerEntry> = {}
            for (const power of uniqueLocalPowers) {
              powers[power.name] = power
            }

            const initialRegistry: KiroPowersRegistry = {
              version: '1.0.0',
              powers,
              repoSources: {},
              lastUpdated: new Date().toISOString(),
            }

            // Write initial registry to disk
            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2))

            // Create writer and execute cleanup
            const writer = new TestableKiroPowersRegistryWriter(registryPath)
            const result = writer.unregisterLocalPowers(false)

            expect(result).toBe(true)

            // Read cleaned registry
            const cleanedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as KiroPowersRegistry

            // In test environment, should reset to empty registry (fallback)
            // since __KIRO_GLOBAL_POWERS_REGISTRY__ is not defined
            expect(cleanedRegistry.version).toBe('1.0.0')
            expect(Object.keys(cleanedRegistry.powers).length).toBe(0)
            expect(Object.keys(cleanedRegistry.repoSources).length).toBe(0)
            expect(cleanedRegistry.lastUpdated).toBeDefined()
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should reset registry and clear all repoSources after cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 0-5 local repoSources
          fc.array(
            fc.tuple(repoSourceIdGen, localRepoSourceGen),
            { minLength: 1, maxLength: 5 },
          ),
          async (localSources) => {
            // Ensure unique IDs by adding suffix
            const uniqueLocalSources = localSources.map(([id, source], i) => [
              `${id}-local-${i}`,
              source,
            ] as const)

            // Build initial registry with local repoSources
            const repoSources: Record<string, KiroRepoSource> = {}
            for (const [id, source] of uniqueLocalSources) {
              repoSources[id] = source
            }

            const initialRegistry: KiroPowersRegistry = {
              version: '1.0.0',
              powers: {},
              repoSources,
              lastUpdated: new Date().toISOString(),
            }

            // Write initial registry to disk
            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2))

            // Create writer and execute cleanup
            const writer = new TestableKiroPowersRegistryWriter(registryPath)
            const result = writer.unregisterLocalPowers(false)

            expect(result).toBe(true)

            // Read cleaned registry
            const cleanedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as KiroPowersRegistry

            // All repoSources should be cleared (reset to official state)
            expect(Object.keys(cleanedRegistry.repoSources).length).toBe(0)
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should preserve registry structure after cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(localPowerEntryGen, { minLength: 1, maxLength: 3 }),
          async (localPowers) => {
            // Ensure unique names
            const uniqueLocalPowers = localPowers.map((p, i) => ({
              ...p,
              name: `${p.name}-${i}`,
            }))

            const powers: Record<string, KiroPowerEntry> = {}
            for (const power of uniqueLocalPowers) {
              powers[power.name] = power
            }

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

            // Write and cleanup
            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2))
            const writer = new TestableKiroPowersRegistryWriter(registryPath)
            writer.unregisterLocalPowers(false)

            // Read cleaned registry
            const cleanedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as KiroPowersRegistry

            // Verify structure is valid (reset to official state)
            expect(cleanedRegistry.version).toBeDefined()
            expect(cleanedRegistry.powers).toBeDefined()
            expect(cleanedRegistry.repoSources).toBeDefined()
            expect(cleanedRegistry.lastUpdated).toBeDefined()
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should succeed when registry file does not exist', async () => {
      // Ensure registry file does not exist
      if (fs.existsSync(registryPath)) {
        fs.unlinkSync(registryPath)
      }

      const writer = new TestableKiroPowersRegistryWriter(registryPath)
      const result = writer.unregisterLocalPowers(false)

      // Should succeed without error (Requirement 6.4)
      expect(result).toBe(true)

      // Registry file should be created with official state
      expect(fs.existsSync(registryPath)).toBe(true)
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as KiroPowersRegistry
      expect(registry.version).toBe('1.0.0')
    })

    it('should not modify registry in dry-run mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(localPowerEntryGen, { minLength: 1, maxLength: 3 }),
          async (localPowers) => {
            // Ensure unique names
            const uniqueLocalPowers = localPowers.map((p, i) => ({
              ...p,
              name: `${p.name}-${i}`,
            }))

            const powers: Record<string, KiroPowerEntry> = {}
            for (const power of uniqueLocalPowers) {
              powers[power.name] = power
            }

            const initialRegistry: KiroPowersRegistry = {
              version: '1.0.0',
              powers,
              repoSources: {},
              lastUpdated: new Date().toISOString(),
            }

            // Write initial registry
            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2))
            const originalContent = fs.readFileSync(registryPath, 'utf-8')

            // Execute cleanup in dry-run mode
            const writer = new TestableKiroPowersRegistryWriter(registryPath)
            // dry-run = true
            const result = writer.unregisterLocalPowers(true)

            expect(result).toBe(true)

            // Verify file was not modified
            const afterContent = fs.readFileSync(registryPath, 'utf-8')
            expect(afterContent).toBe(originalContent)
          },
        ),
        { numRuns: 50 },
      )
    })
  })
})
