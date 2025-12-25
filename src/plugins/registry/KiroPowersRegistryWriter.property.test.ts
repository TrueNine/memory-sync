/**
 * Property-based tests for KiroPowersRegistryWriter
 *
 * Feature: plugin-side-effects
 * Property 6: Registry Cleanup Removes Local Entries
 *
 * For any Kiro powers registry containing local power entries, after executing
 * the clean effect, the registry shall contain no entries where source.repoId
 * starts with 'local-' and no repoSources entries where type === 'local'.
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

// Generator for non-local power entries (source.repoId does NOT start with 'local-')
const nonLocalPowerEntryGen = fc.record({
  name: powerNameGen,
  description: descriptionGen,
  keywords: keywordsGen,
  installed: fc.constant(true),
  installedAt: validDateGen.map((d) => d.toISOString()),
  installPath: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/test/path/${s}`),
  source: fc.record({
    type: fc.constant('repo' as const),
    repoId: fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
      .filter((s) => /^[a-z0-9]+$/i.test(s) && !s.startsWith('local'))
      // Ensure repoId does NOT start with 'local-'
      .map((s) => `remote-${s}`),
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

// Generator for non-local repoSource entries (type === 'git')
const nonLocalRepoSourceGen = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  type: fc.constant('git' as const),
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
   * Feature: plugin-side-effects, Property 6: Registry Cleanup Removes Local Entries
   * Validates: Requirements 6.1, 6.2
   *
   * For any Kiro powers registry containing local power entries, after executing
   * the clean effect, the registry shall contain no entries where source.repoId
   * starts with 'local-' and no repoSources entries where type === 'local'.
   */
  describe('property 6: Registry Cleanup Removes Local Entries', () => {
    it('should remove all local power entries after cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 0-5 local powers and 0-5 non-local powers
          fc.array(localPowerEntryGen, { minLength: 0, maxLength: 5 }),
          fc.array(nonLocalPowerEntryGen, { minLength: 0, maxLength: 5 }),
          async (localPowers, nonLocalPowers) => {
            // Ensure unique names by adding index suffix
            const uniqueLocalPowers = localPowers.map((p, i) => ({
              ...p,
              name: `${p.name}-local-${i}`,
            }))
            const uniqueNonLocalPowers = nonLocalPowers.map((p, i) => ({
              ...p,
              name: `${p.name}-remote-${i}`,
            }))

            // Build initial registry with both local and non-local powers
            const powers: Record<string, KiroPowerEntry> = {}
            for (const power of [...uniqueLocalPowers, ...uniqueNonLocalPowers]) {
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

            // Verify: no power entries with source.repoId starting with 'local-'
            for (const [name, power] of Object.entries(cleanedRegistry.powers)) {
              const repoId = power.source.repoId
              expect(
                repoId == null || !repoId.startsWith('local-'),
                `Power "${name}" should not have repoId starting with 'local-', got: ${repoId}`,
              ).toBe(true)
            }

            // Verify: all non-local powers are preserved
            for (const power of uniqueNonLocalPowers) {
              expect(cleanedRegistry.powers[power.name]).toBeDefined()
            }

            // Verify: all local powers are removed
            for (const power of uniqueLocalPowers) {
              expect(cleanedRegistry.powers[power.name]).toBeUndefined()
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should remove all local repoSource entries after cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 0-5 local repoSources and 0-5 non-local repoSources
          fc.array(
            fc.tuple(repoSourceIdGen, localRepoSourceGen),
            { minLength: 0, maxLength: 5 },
          ),
          fc.array(
            fc.tuple(repoSourceIdGen, nonLocalRepoSourceGen),
            { minLength: 0, maxLength: 5 },
          ),
          async (localSources, nonLocalSources) => {
            // Ensure unique IDs by adding suffix
            const uniqueLocalSources = localSources.map(([id, source], i) => [
              `${id}-local-${i}`,
              source,
            ] as const)
            const uniqueNonLocalSources = nonLocalSources.map(([id, source], i) => [
              `${id}-git-${i}`,
              source,
            ] as const)

            // Build initial registry with both local and non-local repoSources
            const repoSources: Record<string, KiroRepoSource> = {}
            for (const [id, source] of [...uniqueLocalSources, ...uniqueNonLocalSources]) {
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

            // Verify: no repoSource entries with type === 'local'
            for (const [id, source] of Object.entries(cleanedRegistry.repoSources)) {
              expect(
                source.type !== 'local',
                `RepoSource "${id}" should not have type 'local', got: ${source.type}`,
              ).toBe(true)
            }

            // Verify: all non-local repoSources are preserved
            for (const [id] of uniqueNonLocalSources) {
              expect(cleanedRegistry.repoSources[id]).toBeDefined()
            }

            // Verify: all local repoSources are removed
            for (const [id] of uniqueLocalSources) {
              expect(cleanedRegistry.repoSources[id]).toBeUndefined()
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should remove both local powers and local repoSources in a single cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate mixed registry with local and non-local entries
          fc.array(localPowerEntryGen, { minLength: 1, maxLength: 3 }),
          fc.array(nonLocalPowerEntryGen, { minLength: 1, maxLength: 3 }),
          fc.array(fc.tuple(repoSourceIdGen, localRepoSourceGen), { minLength: 1, maxLength: 3 }),
          fc.array(fc.tuple(repoSourceIdGen, nonLocalRepoSourceGen), { minLength: 1, maxLength: 3 }),
          async (localPowers, nonLocalPowers, localSources, nonLocalSources) => {
            // Ensure unique names/IDs
            const uniqueLocalPowers = localPowers.map((p, i) => ({
              ...p,
              name: `${p.name}-local-${i}`,
            }))
            const uniqueNonLocalPowers = nonLocalPowers.map((p, i) => ({
              ...p,
              name: `${p.name}-remote-${i}`,
            }))
            const uniqueLocalSources = localSources.map(([id, source], i) => [
              `${id}-local-${i}`,
              source,
            ] as const)
            const uniqueNonLocalSources = nonLocalSources.map(([id, source], i) => [
              `${id}-git-${i}`,
              source,
            ] as const)

            // Build initial registry
            const powers: Record<string, KiroPowerEntry> = {}
            for (const power of [...uniqueLocalPowers, ...uniqueNonLocalPowers]) {
              powers[power.name] = power
            }

            const repoSources: Record<string, KiroRepoSource> = {}
            for (const [id, source] of [...uniqueLocalSources, ...uniqueNonLocalSources]) {
              repoSources[id] = source
            }

            const initialRegistry: KiroPowersRegistry = {
              version: '1.0.0',
              powers,
              repoSources,
              lastUpdated: new Date().toISOString(),
            }

            // Write and cleanup
            fs.writeFileSync(registryPath, JSON.stringify(initialRegistry, null, 2))
            const writer = new TestableKiroPowersRegistryWriter(registryPath)
            const result = writer.unregisterLocalPowers(false)

            expect(result).toBe(true)

            // Read cleaned registry
            const cleanedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as KiroPowersRegistry

            // Count remaining entries
            const remainingPowerCount = Object.keys(cleanedRegistry.powers).length
            const remainingSourceCount = Object.keys(cleanedRegistry.repoSources).length

            // Verify counts match expected non-local entries
            expect(remainingPowerCount).toBe(uniqueNonLocalPowers.length)
            expect(remainingSourceCount).toBe(uniqueNonLocalSources.length)

            // Verify no local entries remain
            for (const power of Object.values(cleanedRegistry.powers)) {
              expect(power.source.repoId?.startsWith('local-')).not.toBe(true)
            }
            for (const source of Object.values(cleanedRegistry.repoSources)) {
              expect(source.type).not.toBe('local')
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve registry structure and other fields after cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(localPowerEntryGen, { minLength: 1, maxLength: 3 }),
          // version
          fc.string({ minLength: 1, maxLength: 10 }).map((s) => `${s}.0.0`),
          async (localPowers, version) => {
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
              version,
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

            // Verify structure is preserved
            expect(cleanedRegistry.version).toBe(version)
            expect(cleanedRegistry.kiroRecommendedRepo).toEqual(initialRegistry.kiroRecommendedRepo)
            expect(cleanedRegistry.lastUpdated).toBeDefined()
          },
        ),
        { numRuns: 100 },
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
        { numRuns: 100 },
      )
    })
  })
})
