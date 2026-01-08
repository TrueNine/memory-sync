import type {InputPluginContext, PluginOptions} from '@/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {createLogger} from '@/log'
import {ReadmeMdInputPlugin} from './ReadmeMdInputPlugin'

/**
 * Feature: readme-md-plugin
 * Property-based tests for ReadmeMdInputPlugin
 */
describe('readmeMdInputPlugin property tests', () => {
  const plugin = new ReadmeMdInputPlugin()

  /**
   * Create a mock InputPluginContext for testing
   */
  function createMockContext(workspaceDir: string, shadowSourceProjectDir: string): InputPluginContext {
    const options: PluginOptions = {
      workspaceDir,
      shadowSourceProjectDir,
      shadowProjectsDir: path.join(shadowSourceProjectDir, 'ref'),
    }

    return {
      userConfigOptions: options,
      logger: createLogger('test', 'error'),
      fs,
      path,
    }
  }

  /**
   * Create directory structure for testing
   */
  function createDirectoryStructure(
    baseDir: string,
    structure: Record<string, string | null>,
  ): void {
    for (const [filePath, content] of Object.entries(structure)) {
      const fullPath = path.join(baseDir, filePath)
      const dir = path.dirname(fullPath)

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})

      if (content !== null) fs.writeFileSync(fullPath, content, 'utf8')
    }
  }

  /**
   * Create isolated temp directory and run test, then cleanup
   */
  async function withTempDir<T>(fn: (tempDir: string) => Promise<T>): Promise<T> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-test-'))
    try {
      return await fn(tempDir)
    } finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  }

  /**
   * Feature: readme-md-plugin, Property 1: README Discovery Completeness
   *
   * For any shadow project directory structure containing readme.mdx files,
   * the ReadmeMdInputPlugin SHALL discover all readme.mdx files at both
   * ref/project/readme.mdx (root) and ref/project/subdir/readme.mdx (child) locations,
   * and continue processing remaining files when individual file reads fail.
   *
   * Validates: Requirements 1.1, 1.2, 1.3, 1.5
   */
  describe('property 1: README Discovery Completeness', () => {
    // Generate valid project names (alphanumeric, no special chars)
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate valid subdirectory names
    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate README content
    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    it('should discover all readme.mdx files in generated directory structures', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-3 projects
          fc.array(projectNameArb, {minLength: 1, maxLength: 3}),
          // Generate 0-2 subdirectories per project
          fc.array(subdirNameArb, {minLength: 0, maxLength: 2}),
          // Whether to include root README
          fc.boolean(),
          // README content (avoid MDX expressions that need globalScope)
          readmeContentArb,
          async (projectNames, subdirs, includeRoot, content) => {
            await withTempDir(async tempDir => {
              // Deduplicate project names
              const uniqueProjects = [...new Set(projectNames)]
              const uniqueSubdirs = [...new Set(subdirs)]

              // Build directory structure
              const structure: Record<string, string | null> = {}
              const expectedReadmes: {projectName: string, isRoot: boolean, subdir?: string}[] = []

              for (const projectName of uniqueProjects) {
                // Create project directory
                structure[`ref/${projectName}/.gitkeep`] = ''

                // Add root README if flag is true
                if (includeRoot) {
                  structure[`ref/${projectName}/readme.mdx`] = content
                  expectedReadmes.push({projectName, isRoot: true})
                }

                // Add child READMEs
                for (const subdir of uniqueSubdirs) {
                  structure[`ref/${projectName}/${subdir}/readme.mdx`] = content
                  expectedReadmes.push({projectName, isRoot: false, subdir})
                }
              }

              // Create the structure
              createDirectoryStructure(tempDir, structure)

              // Run the plugin (now async)
              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)

              // Verify all expected READMEs were discovered
              const readmePrompts = result.readmePrompts ?? []

              expect(readmePrompts.length).toBe(expectedReadmes.length)

              for (const expected of expectedReadmes) {
                const found = readmePrompts.find(
                  r =>
                    r.projectName === expected.projectName
                    && r.isRoot === expected.isRoot,
                )
                expect(found).toBeDefined()
                expect(found?.content).toBe(content)
              }
            })
          },
        ),
        {numRuns: 100},
      )
    })

    it('should return empty result when shadow source directory does not exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          async projectName => {
            await withTempDir(async tempDir => {
              // Create workspace but no ref directory
              const workspaceDir = path.join(tempDir, projectName)
              fs.mkdirSync(workspaceDir, {recursive: true})

              const ctx = createMockContext(workspaceDir, workspaceDir)
              const result = await plugin.collect(ctx)

              expect(result.readmePrompts).toEqual([])
            })
          },
        ),
        {numRuns: 100},
      )
    })
  })

  /**
   * Feature: readme-md-plugin, Property 2: Data Structure Correctness
   *
   * For any discovered readme.mdx file, the resulting ReadmePrompt SHALL contain
   * the correct projectName, content, relative path, and isRoot flag that accurately
   * reflects whether the file is a root README (in project root) or child README (in subdir/).
   *
   * Validates: Requirements 2.1, 2.2, 2.3
   */
  describe('property 2: Data Structure Correctness', () => {
    // Generate valid project names
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate valid subdirectory names
    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate README content
    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    it('should correctly set isRoot flag based on README location', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          subdirNameArb,
          readmeContentArb,
          readmeContentArb,
          async (projectName, subdir, rootContent, childContent) => {
            await withTempDir(async tempDir => {
              // Create structure with both root and child README
              const structure: Record<string, string | null> = {
                [`ref/${projectName}/readme.mdx`]: rootContent,
                [`ref/${projectName}/${subdir}/readme.mdx`]: childContent,
              }

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              // Find root README
              const rootReadme = readmePrompts.find(r => r.isRoot)
              expect(rootReadme).toBeDefined()
              expect(rootReadme?.projectName).toBe(projectName)
              expect(rootReadme?.content).toBe(rootContent)
              expect(rootReadme?.targetDir.path).toBe(projectName)

              // Find child README
              const childReadme = readmePrompts.find(r => !r.isRoot)
              expect(childReadme).toBeDefined()
              expect(childReadme?.projectName).toBe(projectName)
              expect(childReadme?.content).toBe(childContent)
              expect(childReadme?.targetDir.path).toBe(path.join(projectName, subdir))
            })
          },
        ),
        {numRuns: 100},
      )
    })

    it('should preserve content exactly as read from file', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          async (projectName, content) => {
            await withTempDir(async tempDir => {
              const structure: Record<string, string | null> = {
                [`ref/${projectName}/readme.mdx`]: content,
              }

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              expect(readmePrompts.length).toBe(1)
              expect(readmePrompts[0].content).toBe(content)
              expect(readmePrompts[0].length).toBe(content.length)
            })
          },
        ),
        {numRuns: 100},
      )
    })

    it('should correctly set targetDir with proper path structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          fc.array(subdirNameArb, {minLength: 1, maxLength: 3}),
          readmeContentArb,
          async (projectName, subdirs, content) => {
            await withTempDir(async tempDir => {
              const uniqueSubdirs = [...new Set(subdirs)]
              const structure: Record<string, string | null> = {}

              for (const subdir of uniqueSubdirs) structure[`ref/${projectName}/${subdir}/readme.mdx`] = content

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              for (const readme of readmePrompts) {
                // Verify targetDir structure
                expect(readme.targetDir.basePath).toBe(tempDir)
                expect(readme.targetDir.getAbsolutePath()).toBe(
                  path.resolve(tempDir, readme.targetDir.path),
                )
              }
            })
          },
        ),
        {numRuns: 100},
      )
    })
  })
})
