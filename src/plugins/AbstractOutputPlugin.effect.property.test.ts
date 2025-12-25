import type {
  CleanEffectHandler,
  EffectResult,
  OutputCleanContext,
  OutputWriteContext,
  WriteEffectHandler,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { FilePathKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

/**
 * Test implementation that exposes effect registration and execution for testing.
 */
class TestEffectPlugin extends AbstractOutputPlugin {
  constructor() {
    super('TestEffectPlugin', {
      outputFileName: 'TEST.md',
    })
  }

  /**
   * Expose registerWriteEffect for testing
   */
  public testRegisterWriteEffect(name: string, handler: WriteEffectHandler): void {
    this.registerWriteEffect(name, handler)
  }

  /**
   * Expose registerCleanEffect for testing
   */
  public testRegisterCleanEffect(name: string, handler: CleanEffectHandler): void {
    this.registerCleanEffect(name, handler)
  }

  /**
   * Expose executeWriteEffects for testing
   */
  public async testExecuteWriteEffects(ctx: OutputWriteContext): Promise<EffectResult[]> {
    return this.executeWriteEffects(ctx)
  }

  /**
   * Expose executeCleanEffects for testing
   */
  public async testExecuteCleanEffects(ctx: OutputCleanContext): Promise<EffectResult[]> {
    return this.executeCleanEffects(ctx)
  }
}

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => `${basePath}/${pathStr}`,
  }
}

function createMockWriteContext(dryRun: boolean = false): OutputWriteContext {
  return {
    collectedInputContext: {
      workspace: {
        directory: createMockRelativePath('.', '/test'),
        projects: [],
      },
      ideConfigFiles: [],
      globalMemory: null as any,
    } as any,
    dryRun,
  }
}

function createMockCleanContext(dryRun: boolean = false): OutputCleanContext {
  return {
    collectedInputContext: {
      workspace: {
        directory: createMockRelativePath('.', '/test'),
        projects: [],
      },
      ideConfigFiles: [],
      globalMemory: null as any,
    } as any,
    dryRun,
  }
}

/**
 * Feature: plugin-side-effects
 * Property-based tests for effect execution order and error resilience
 *
 * Property 4: Error Resilience - Continue on Failure
 * For any sequence of registered effects where effect at index K fails,
 * all effects at indices > K shall still be executed.
 *
 * Property 5: Sequential Execution Order
 * For any sequence of N registered effects, the effects shall execute in registration order
 * (effect registered first executes first), and each effect shall complete before the next begins.
 *
 * Validates: Requirements 2.5, 3.5, 5.1, 5.2, 5.3
 */
describe('abstractOutputPlugin Effect Property Tests', () => {
  /**
   * Feature: plugin-side-effects, Property 5: Sequential Execution Order
   * Validates: Requirements 5.1, 5.2, 5.3
   *
   * For any sequence of N registered write effects, the effects shall execute
   * in registration order (effect registered first executes first).
   */
  describe('property 5: Write Effects Sequential Execution Order', () => {
    // Generator for effect names (alphanumeric, non-empty)
    const effectNameGen = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
      .filter((s) => /^[a-z0-9]+$/i.test(s))

    it('should execute write effects in registration order', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-10 unique effect names
          fc.array(effectNameGen, { minLength: 1, maxLength: 10 })
            // Ensure unique names
            .map((names) => [...new Set(names)])
            .filter((names) => names.length >= 1),
          async (effectNames) => {
            const plugin = new TestEffectPlugin()
            const executionOrder: string[] = []
            const ctx = createMockWriteContext(false)

            // Register effects in order
            for (const name of effectNames) {
              plugin.testRegisterWriteEffect(name, async () => {
                executionOrder.push(name)
                return { success: true, description: `Executed ${name}` }
              })
            }

            // Execute effects
            const results = await plugin.testExecuteWriteEffects(ctx)

            // Verify execution order matches registration order
            expect(executionOrder).toEqual(effectNames)
            expect(results.length).toBe(effectNames.length)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return results in registration order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(effectNameGen, { minLength: 1, maxLength: 10 })
            .map((names) => [...new Set(names)])
            .filter((names) => names.length >= 1),
          async (effectNames) => {
            const plugin = new TestEffectPlugin()
            const ctx = createMockWriteContext(false)

            // Register effects with unique descriptions
            for (const name of effectNames) {
              plugin.testRegisterWriteEffect(name, async () => {
                return { success: true, description: `Result-${name}` }
              })
            }

            const results = await plugin.testExecuteWriteEffects(ctx)

            // Verify results are in registration order
            for (let i = 0; i < effectNames.length; i++) {
              expect(results[i].description).toBe(`Result-${effectNames[i]}`)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: plugin-side-effects, Property 5: Sequential Execution Order
   * Validates: Requirements 5.1, 5.2, 5.3
   *
   * For any sequence of N registered clean effects, the effects shall execute
   * in registration order (effect registered first executes first).
   */
  describe('property 5: Clean Effects Sequential Execution Order', () => {
    const effectNameGen = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
      .filter((s) => /^[a-z0-9]+$/i.test(s))

    it('should execute clean effects in registration order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(effectNameGen, { minLength: 1, maxLength: 10 })
            .map((names) => [...new Set(names)])
            .filter((names) => names.length >= 1),
          async (effectNames) => {
            const plugin = new TestEffectPlugin()
            const executionOrder: string[] = []
            const ctx = createMockCleanContext(false)

            // Register effects in order
            for (const name of effectNames) {
              plugin.testRegisterCleanEffect(name, async () => {
                executionOrder.push(name)
                return { success: true, description: `Executed ${name}` }
              })
            }

            // Execute effects
            const results = await plugin.testExecuteCleanEffects(ctx)

            // Verify execution order matches registration order
            expect(executionOrder).toEqual(effectNames)
            expect(results.length).toBe(effectNames.length)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return results in registration order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(effectNameGen, { minLength: 1, maxLength: 10 })
            .map((names) => [...new Set(names)])
            .filter((names) => names.length >= 1),
          async (effectNames) => {
            const plugin = new TestEffectPlugin()
            const ctx = createMockCleanContext(false)

            // Register effects with unique descriptions
            for (const name of effectNames) {
              plugin.testRegisterCleanEffect(name, async () => {
                return { success: true, description: `Result-${name}` }
              })
            }

            const results = await plugin.testExecuteCleanEffects(ctx)

            // Verify results are in registration order
            for (let i = 0; i < effectNames.length; i++) {
              expect(results[i].description).toBe(`Result-${effectNames[i]}`)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: plugin-side-effects, Property 5: Sequential Execution Order
   * Validates: Requirements 5.3
   *
   * Effects shall execute sequentially (not in parallel).
   * Each effect shall complete before the next begins.
   */
  describe('property 5: Sequential (Non-Parallel) Execution', () => {
    it('should execute write effects sequentially, not in parallel', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 2-5 effects with random delays
          fc.array(fc.nat({ max: 50 }), { minLength: 2, maxLength: 5 }),
          async (delays) => {
            const plugin = new TestEffectPlugin()
            const ctx = createMockWriteContext(false)
            const executionLog: Array<{ name: string, event: 'start' | 'end', time: number }> = []
            const startTime = Date.now()

            // Register effects with delays
            for (let i = 0; i < delays.length; i++) {
              const name = `effect-${i}`
              const delay = delays[i]
              plugin.testRegisterWriteEffect(name, async () => {
                executionLog.push({ name, event: 'start', time: Date.now() - startTime })
                await new Promise((resolve) => setTimeout(resolve, delay))
                executionLog.push({ name, event: 'end', time: Date.now() - startTime })
                return { success: true }
              })
            }

            await plugin.testExecuteWriteEffects(ctx)

            // Verify sequential execution: each effect's start should be after previous effect's end
            for (let i = 1; i < delays.length; i++) {
              const prevEnd = executionLog.find((e) => e.name === `effect-${i - 1}` && e.event === 'end')
              const currStart = executionLog.find((e) => e.name === `effect-${i}` && e.event === 'start')

              expect(prevEnd).toBeDefined()
              expect(currStart).toBeDefined()
              // Current effect should start at or after previous effect ends
              expect(currStart!.time).toBeGreaterThanOrEqual(prevEnd!.time)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should execute clean effects sequentially, not in parallel', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.nat({ max: 50 }), { minLength: 2, maxLength: 5 }),
          async (delays) => {
            const plugin = new TestEffectPlugin()
            const ctx = createMockCleanContext(false)
            const executionLog: Array<{ name: string, event: 'start' | 'end', time: number }> = []
            const startTime = Date.now()

            // Register effects with delays
            for (let i = 0; i < delays.length; i++) {
              const name = `effect-${i}`
              const delay = delays[i]
              plugin.testRegisterCleanEffect(name, async () => {
                executionLog.push({ name, event: 'start', time: Date.now() - startTime })
                await new Promise((resolve) => setTimeout(resolve, delay))
                executionLog.push({ name, event: 'end', time: Date.now() - startTime })
                return { success: true }
              })
            }

            await plugin.testExecuteCleanEffects(ctx)

            // Verify sequential execution
            for (let i = 1; i < delays.length; i++) {
              const prevEnd = executionLog.find((e) => e.name === `effect-${i - 1}` && e.event === 'end')
              const currStart = executionLog.find((e) => e.name === `effect-${i}` && e.event === 'start')

              expect(prevEnd).toBeDefined()
              expect(currStart).toBeDefined()
              expect(currStart!.time).toBeGreaterThanOrEqual(prevEnd!.time)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: plugin-side-effects, Property 4: Error Resilience - Continue on Failure
   * Validates: Requirements 2.5, 3.5
   *
   * For any sequence of registered effects where effect at index K fails,
   * all effects at indices > K shall still be executed.
   */
  describe('property 4: Error Resilience - Continue on Failure', () => {
    /**
     * Generator for failure patterns: array of booleans where true = should fail
     * Ensures at least one failure and at least one success after the first failure
     */
    const failurePatternGen = fc.array(fc.boolean(), { minLength: 2, maxLength: 10 })
      .filter((pattern) => {
        // Must have at least one failure
        const hasFailure = pattern.some((shouldFail) => shouldFail)
        // Must have at least one effect after the first failure
        const firstFailureIndex = pattern.findIndex((shouldFail) => shouldFail)
        const hasEffectAfterFailure = firstFailureIndex < pattern.length - 1
        return hasFailure && hasEffectAfterFailure
      })

    it('should continue executing write effects after a failure', async () => {
      await fc.assert(
        fc.asyncProperty(
          failurePatternGen,
          async (failurePattern) => {
            const plugin = new TestEffectPlugin()
            const ctx = createMockWriteContext(false)
            const executedEffects: number[] = []

            // Register effects based on failure pattern
            for (let i = 0; i < failurePattern.length; i++) {
              const shouldFail = failurePattern[i]
              plugin.testRegisterWriteEffect(`effect-${i}`, async () => {
                executedEffects.push(i)
                if (shouldFail) {
                  throw new Error(`Effect ${i} failed`)
                }
                return { success: true, description: `Effect ${i} succeeded` }
              })
            }

            // Execute effects
            const results = await plugin.testExecuteWriteEffects(ctx)

            // All effects should have been executed regardless of failures
            expect(executedEffects.length).toBe(failurePattern.length)
            expect(executedEffects).toEqual(failurePattern.map((_, i) => i))

            // Results should match the failure pattern
            expect(results.length).toBe(failurePattern.length)
            for (let i = 0; i < failurePattern.length; i++) {
              if (failurePattern[i]) {
                expect(results[i].success).toBe(false)
                expect(results[i].error).toBeDefined()
              } else {
                expect(results[i].success).toBe(true)
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should continue executing clean effects after a failure', async () => {
      await fc.assert(
        fc.asyncProperty(
          failurePatternGen,
          async (failurePattern) => {
            const plugin = new TestEffectPlugin()
            const ctx = createMockCleanContext(false)
            const executedEffects: number[] = []

            // Register effects based on failure pattern
            for (let i = 0; i < failurePattern.length; i++) {
              const shouldFail = failurePattern[i]
              plugin.testRegisterCleanEffect(`effect-${i}`, async () => {
                executedEffects.push(i)
                if (shouldFail) {
                  throw new Error(`Effect ${i} failed`)
                }
                return { success: true, description: `Effect ${i} succeeded` }
              })
            }

            // Execute effects
            const results = await plugin.testExecuteCleanEffects(ctx)

            // All effects should have been executed regardless of failures
            expect(executedEffects.length).toBe(failurePattern.length)
            expect(executedEffects).toEqual(failurePattern.map((_, i) => i))

            // Results should match the failure pattern
            expect(results.length).toBe(failurePattern.length)
            for (let i = 0; i < failurePattern.length; i++) {
              if (failurePattern[i]) {
                expect(results[i].success).toBe(false)
                expect(results[i].error).toBeDefined()
              } else {
                expect(results[i].success).toBe(true)
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should execute all write effects after multiple consecutive failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate effect count and a set of indices that should fail
          fc.integer({ min: 3, max: 10 }),
          fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 5 }),
          async (effectCount, failIndices) => {
            // Normalize fail indices to be within range
            const normalizedFailIndices = new Set(
              failIndices.map((i) => i % effectCount),
            )

            const plugin = new TestEffectPlugin()
            const ctx = createMockWriteContext(false)
            const executedEffects: number[] = []

            // Register effects
            for (let i = 0; i < effectCount; i++) {
              const shouldFail = normalizedFailIndices.has(i)
              plugin.testRegisterWriteEffect(`effect-${i}`, async () => {
                executedEffects.push(i)
                if (shouldFail) {
                  throw new Error(`Effect ${i} failed`)
                }
                return { success: true }
              })
            }

            await plugin.testExecuteWriteEffects(ctx)

            // All effects should have been executed
            expect(executedEffects.length).toBe(effectCount)
            expect(executedEffects).toEqual(Array.from({ length: effectCount }, (_, i) => i))
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should execute all clean effects after multiple consecutive failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 10 }),
          fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 5 }),
          async (effectCount, failIndices) => {
            const normalizedFailIndices = new Set(
              failIndices.map((i) => i % effectCount),
            )

            const plugin = new TestEffectPlugin()
            const ctx = createMockCleanContext(false)
            const executedEffects: number[] = []

            // Register effects
            for (let i = 0; i < effectCount; i++) {
              const shouldFail = normalizedFailIndices.has(i)
              plugin.testRegisterCleanEffect(`effect-${i}`, async () => {
                executedEffects.push(i)
                if (shouldFail) {
                  throw new Error(`Effect ${i} failed`)
                }
                return { success: true }
              })
            }

            await plugin.testExecuteCleanEffects(ctx)

            // All effects should have been executed
            expect(executedEffects.length).toBe(effectCount)
            expect(executedEffects).toEqual(Array.from({ length: effectCount }, (_, i) => i))
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should capture error details in results for failed write effects', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
          async (failurePattern, errorMessages) => {
            const plugin = new TestEffectPlugin()
            const ctx = createMockWriteContext(false)

            // Register effects with custom error messages
            for (let i = 0; i < failurePattern.length; i++) {
              const shouldFail = failurePattern[i]
              const errorMsg = errorMessages[i % errorMessages.length]
              plugin.testRegisterWriteEffect(`effect-${i}`, async () => {
                if (shouldFail) {
                  throw new Error(errorMsg)
                }
                return { success: true }
              })
            }

            const results = await plugin.testExecuteWriteEffects(ctx)

            // Verify error details are captured
            for (let i = 0; i < failurePattern.length; i++) {
              if (failurePattern[i]) {
                expect(results[i].success).toBe(false)
                expect(results[i].error).toBeInstanceOf(Error)
                expect(results[i].error?.message).toBe(errorMessages[i % errorMessages.length])
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should capture error details in results for failed clean effects', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
          async (failurePattern, errorMessages) => {
            const plugin = new TestEffectPlugin()
            const ctx = createMockCleanContext(false)

            // Register effects with custom error messages
            for (let i = 0; i < failurePattern.length; i++) {
              const shouldFail = failurePattern[i]
              const errorMsg = errorMessages[i % errorMessages.length]
              plugin.testRegisterCleanEffect(`effect-${i}`, async () => {
                if (shouldFail) {
                  throw new Error(errorMsg)
                }
                return { success: true }
              })
            }

            const results = await plugin.testExecuteCleanEffects(ctx)

            // Verify error details are captured
            for (let i = 0; i < failurePattern.length; i++) {
              if (failurePattern[i]) {
                expect(results[i].success).toBe(false)
                expect(results[i].error).toBeInstanceOf(Error)
                expect(results[i].error?.message).toBe(errorMessages[i % errorMessages.length])
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
