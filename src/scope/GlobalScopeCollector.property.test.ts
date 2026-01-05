// src/scope/GlobalScopeCollector.property.test.ts
// Property-based tests for GlobalScopeCollector
// Feature: compiler-integration

import type { UserConfigFile } from '@/types/ConfigTypes'
import * as os from 'node:os'
import process from 'node:process'
import * as fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ShellKind } from '@/globals'
import { GlobalScopeCollector } from './GlobalScopeCollector'

/**
 * Feature: compiler-integration
 * Property-based tests for GlobalScopeCollector
 */
describe('globalScopeCollector property tests', () => {
  // Store original env to restore after tests
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  /**
   * Feature: compiler-integration, Property 1: OS 信息收集完整性
   * For any system environment, GlobalScopeCollector's os namespace should contain
   * all required properties (platform, arch, hostname, homedir, tmpdir, type, release, shellKind),
   * and each property value should match the value returned by Node.js os module.
   * Validates: Requirements 1.1, 1.4
   */
  describe('property 1: OS Information Collection Completeness', () => {
    it('should collect all required OS properties matching Node.js os module', () => {
      fc.assert(
        fc.property(
          // Generate arbitrary user configs (or none)
          fc.option(
            fc.record({
              profile: fc.option(fc.record({ name: fc.string() }), { nil: void 0 }),
              tool: fc.option(fc.record({ websearch: fc.string() }), { nil: void 0 }),
            }),
            { nil: void 0 },
          ),
          (userConfig) => {
            const collector = new GlobalScopeCollector({
              userConfig: userConfig as UserConfigFile | undefined,
            })
            const scope = collector.collect()

            // Verify all required OS properties exist
            expect(scope.os).toBeDefined()
            expect(scope.os.platform).toBeDefined()
            expect(scope.os.arch).toBeDefined()
            expect(scope.os.hostname).toBeDefined()
            expect(scope.os.homedir).toBeDefined()
            expect(scope.os.tmpdir).toBeDefined()
            expect(scope.os.type).toBeDefined()
            expect(scope.os.release).toBeDefined()
            expect(scope.os.shellKind).toBeDefined()

            // Verify values match Node.js os module
            expect(scope.os.platform).toBe(os.platform())
            expect(scope.os.arch).toBe(os.arch())
            expect(scope.os.hostname).toBe(os.hostname())
            expect(scope.os.homedir).toBe(os.homedir())
            expect(scope.os.tmpdir).toBe(os.tmpdir())
            expect(scope.os.type).toBe(os.type())
            expect(scope.os.release).toBe(os.release())
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should always return consistent OS info across multiple collections', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (iterations) => {
            const collector = new GlobalScopeCollector()

            // Collect multiple times and verify consistency
            const results = Array.from({ length: iterations }, () => collector.collect())

            for (let i = 1; i < results.length; i++) {
              expect(results[i].os.platform).toBe(results[0].os.platform)
              expect(results[i].os.arch).toBe(results[0].os.arch)
              expect(results[i].os.type).toBe(results[0].os.type)
              expect(results[i].os.release).toBe(results[0].os.release)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: compiler-integration, Property 2: Shell 类型检测正确性
   * For any SHELL or ComSpec environment variable value, GlobalScopeCollector should
   * correctly identify the shell type according to the mapping rules.
   * Validates: Requirements 1.5
   */
  describe('property 2: Shell Type Detection Correctness', () => {
    // Shell detection mapping
    const shellMappings: Array<{ pattern: string, expected: ShellKind }> = [
      { pattern: 'bash', expected: ShellKind.Bash },
      { pattern: 'zsh', expected: ShellKind.Zsh },
      { pattern: 'fish', expected: ShellKind.Fish },
      { pattern: 'pwsh', expected: ShellKind.Pwsh },
      { pattern: 'powershell', expected: ShellKind.PowerShell },
      { pattern: 'cmd', expected: ShellKind.Cmd },
    ]

    it('should detect shell type correctly based on SHELL environment variable', () => {
      // All shell patterns to filter out from prefix/suffix
      const allShellPatterns = ['bash', 'zsh', 'fish', 'pwsh', 'powershell', 'cmd']

      fc.assert(
        fc.property(
          fc.constantFrom(...shellMappings),
          fc.string({ minLength: 0, maxLength: 20 }).filter((s) => {
            const lower = s.toLowerCase()
            return !allShellPatterns.some((p) => lower.includes(p))
          }),
          fc.string({ minLength: 0, maxLength: 20 }).filter((s) => {
            const lower = s.toLowerCase()
            return !allShellPatterns.some((p) => lower.includes(p))
          }),
          ({ pattern, expected }, prefix, suffix) => {
            // Set SHELL env var with the pattern
            process.env['SHELL'] = `${prefix}${pattern}${suffix}`
            delete process.env['ComSpec']

            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            expect(scope.os.shellKind).toBe(expected)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should detect shell type correctly based on ComSpec environment variable', () => {
      // All shell patterns to filter out from prefix/suffix
      const allShellPatterns = ['bash', 'zsh', 'fish', 'pwsh', 'powershell', 'cmd']

      fc.assert(
        fc.property(
          fc.constantFrom(...shellMappings),
          fc.string({ minLength: 0, maxLength: 20 }).filter((s) => {
            const lower = s.toLowerCase()
            return !allShellPatterns.some((p) => lower.includes(p))
          }),
          fc.string({ minLength: 0, maxLength: 20 }).filter((s) => {
            const lower = s.toLowerCase()
            return !allShellPatterns.some((p) => lower.includes(p))
          }),
          ({ pattern, expected }, prefix, suffix) => {
            // Set ComSpec env var with the pattern (Windows)
            delete process.env['SHELL']
            process.env['ComSpec'] = `${prefix}${pattern}${suffix}`

            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            expect(scope.os.shellKind).toBe(expected)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should detect Sh shell when path ends with /sh', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }).filter((s) => {
            // Exclude strings that contain other shell patterns
            const lower = s.toLowerCase()
            return !lower.includes('bash')
              && !lower.includes('zsh')
              && !lower.includes('fish')
              && !lower.includes('pwsh')
              && !lower.includes('powershell')
              && !lower.includes('cmd')
          }),
          (prefix) => {
            process.env['SHELL'] = `${prefix}/sh`
            delete process.env['ComSpec']

            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            expect(scope.os.shellKind).toBe(ShellKind.Sh)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return Unknown for unrecognized shell patterns', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
            const lower = s.toLowerCase()
            // Exclude all known shell patterns
            return !lower.includes('bash')
              && !lower.includes('zsh')
              && !lower.includes('fish')
              && !lower.includes('pwsh')
              && !lower.includes('powershell')
              && !lower.includes('cmd')
              && !lower.endsWith('/sh')
          }),
          (unknownShell) => {
            process.env['SHELL'] = unknownShell
            delete process.env['ComSpec']

            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            expect(scope.os.shellKind).toBe(ShellKind.Unknown)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return Unknown when no shell environment variable is set', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            delete process.env['SHELL']
            delete process.env['ComSpec']

            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            expect(scope.os.shellKind).toBe(ShellKind.Unknown)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should prefer SHELL over ComSpec when both are set', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...shellMappings),
          fc.constantFrom(...shellMappings),
          ({ pattern: shellPattern, expected: shellExpected }, { pattern: comSpecPattern }) => {
            // Set both env vars with different patterns
            process.env['SHELL'] = `/usr/bin/${shellPattern}`
            process.env['ComSpec'] = `C:\\Windows\\System32\\${comSpecPattern}.exe`

            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            // SHELL should take precedence (it's checked first via ??)
            expect(scope.os.shellKind).toBe(shellExpected)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: compiler-integration, Property 3: 环境变量收集完整性
   * For any set of environment variables, GlobalScopeCollector's env namespace
   * should contain all key-value pairs from process.env with equal values.
   * Validates: Requirements 1.2
   */
  describe('property 3: Environment Variable Collection Completeness', () => {
    it('should collect all environment variables from process.env', () => {
      fc.assert(
        fc.property(
          // Generate random env vars to add
          // Exclude __proto__ and other special properties that have special behavior in JS
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
              /^[A-Z_]\w*$/i.test(s)
              && s !== '__proto__'
              && s !== 'constructor'
              && s !== 'prototype',
            ),
            fc.string({ minLength: 0, maxLength: 100 }),
            { minKeys: 0, maxKeys: 10 },
          ),
          (additionalEnvVars) => {
            // Add random env vars
            for (const [key, value] of Object.entries(additionalEnvVars)) {
              process.env[key] = value
            }

            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            // Verify all process.env keys are in scope.env
            for (const [key, value] of Object.entries(process.env)) {
              expect(scope.env[key]).toBe(value)
            }

            // Verify the added env vars are present
            for (const [key, value] of Object.entries(additionalEnvVars)) {
              expect(scope.env[key]).toBe(value)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should create a copy of env vars (not a reference)', () => {
      fc.assert(
        fc.property(
          // Exclude __proto__ and other special properties
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
            /^[A-Z_]\w*$/i.test(s)
            && s !== '__proto__'
            && s !== 'constructor'
            && s !== 'prototype',
          ),
          fc.string({ minLength: 1, maxLength: 50 }),
          (key, value) => {
            process.env[key] = value

            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            // Verify the value is collected
            expect(scope.env[key]).toBe(value)

            // Modify process.env after collection
            const newValue = `${value}_modified`
            process.env[key] = newValue

            // The collected scope should still have the original value
            // (since it's a spread copy)
            expect(scope.env[key]).toBe(value)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle empty environment gracefully', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            // Note: We can't actually clear process.env completely in Node.js
            // but we can verify the collector handles whatever is there
            const collector = new GlobalScopeCollector()
            const scope = collector.collect()

            expect(scope.env).toBeDefined()
            expect(typeof scope.env).toBe('object')
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
