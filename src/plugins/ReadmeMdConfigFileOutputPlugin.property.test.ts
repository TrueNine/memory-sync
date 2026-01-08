import type {
  CollectedInputContext,
  OutputPluginContext,
  OutputWriteContext,
  ReadmePrompt,
  Workspace,
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createLogger} from '@/log'
import {FilePathKind, PromptKind} from '@/types'
import {ReadmeMdConfigFileOutputPlugin} from './ReadmeMdConfigFileOutputPlugin'

/**
 * Feature: readme-md-plugin
 * Property-based tests for ReadmeMdConfigFileOutputPlugin
 */
describe('readmeMdConfigFileOutputPlugin property tests', () => {
  const plugin = new ReadmeMdConfigFileOutputPlugin()
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-output-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, {recursive: true, force: true})
  })

  /**
   * Create a mock ReadmePrompt for testing
   */
  function createReadmePrompt(
    projectName: string,
    content: string,
    isRoot: boolean,
    basePath: string,
    subdir?: string,
  ): ReadmePrompt {
    const targetPath = isRoot ? projectName : path.join(projectName, subdir ?? '')

    const targetDir: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: targetPath,
      basePath,
      getDirectoryName: () => isRoot ? projectName : path.basename(subdir ?? ''),
      getAbsolutePath: () => path.resolve(basePath, targetPath),
    }

    const dir: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: targetPath,
      basePath,
      getDirectoryName: () => isRoot ? projectName : path.basename(subdir ?? ''),
      getAbsolutePath: () => path.resolve(basePath, targetPath),
    }

    return {
      type: PromptKind.Readme,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      projectName,
      targetDir,
      isRoot,
      markdownContents: [],
      dir,
    }
  }

  /**
   * Create a mock OutputPluginContext
   */
  function createMockPluginContext(
    readmePrompts: readonly ReadmePrompt[],
    basePath: string,
  ): OutputPluginContext {
    const workspace: Workspace = {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: basePath,
        getDirectoryName: () => path.basename(basePath),
        getAbsolutePath: () => basePath,
      },
      projects: [],
    }

    const collectedInputContext: CollectedInputContext = {
      workspace,
      ideConfigFiles: [],
      readmePrompts,
    }

    return {
      collectedInputContext,
      logger: createLogger('test', 'error'),
      fs,
      path,
      glob: {} as typeof import('fast-glob'),
    }
  }

  /**
   * Create a mock OutputWriteContext
   */
  function createMockWriteContext(
    readmePrompts: readonly ReadmePrompt[],
    basePath: string,
    dryRun: boolean = false,
  ): OutputWriteContext {
    const pluginCtx = createMockPluginContext(readmePrompts, basePath)
    return {
      ...pluginCtx,
      dryRun,
    }
  }

  /**
   * Feature: readme-md-plugin, Property 3: Output Path Mapping
   *
   * For any ReadmePrompt with projectName P and relative path R,
   * the ReadmeMdConfigFileOutputPlugin SHALL write root READMEs to
   * <workspace>/<P>/README.md and child READMEs to <workspace>/<P>/<R>/README.md.
   *
   * Validates: Requirements 3.1, 3.2
   */
  describe('property 3: Output Path Mapping', () => {
    // Generate valid project names
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate valid subdirectory names
    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate README content
    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    it('should register correct output paths for root READMEs', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          async (projectName, content) => {
            const readme = createReadmePrompt(projectName, content, true, tempDir)
            const ctx = createMockPluginContext([readme], tempDir)

            const registeredPaths = await plugin.registerProjectOutputFiles(ctx)

            expect(registeredPaths.length).toBe(1)
            expect(registeredPaths[0].path).toBe(path.join(projectName, 'README.md'))
            expect(registeredPaths[0].basePath).toBe(tempDir)
            expect(registeredPaths[0].getAbsolutePath()).toBe(
              path.join(tempDir, projectName, 'README.md'),
            )
          },
        ),
        {numRuns: 100},
      )
    })

    it('should register correct output paths for child READMEs', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          subdirNameArb,
          readmeContentArb,
          async (projectName, subdir, content) => {
            const readme = createReadmePrompt(projectName, content, false, tempDir, subdir)
            const ctx = createMockPluginContext([readme], tempDir)

            const registeredPaths = await plugin.registerProjectOutputFiles(ctx)

            expect(registeredPaths.length).toBe(1)
            expect(registeredPaths[0].path).toBe(path.join(projectName, subdir, 'README.md'))
            expect(registeredPaths[0].basePath).toBe(tempDir)
            expect(registeredPaths[0].getAbsolutePath()).toBe(
              path.join(tempDir, projectName, subdir, 'README.md'),
            )
          },
        ),
        {numRuns: 100},
      )
    })

    it('should write root README to correct path', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          async (projectName, content) => {
            const readme = createReadmePrompt(projectName, content, true, tempDir)
            const ctx = createMockWriteContext([readme], tempDir, false)

            const results = await plugin.writeProjectOutputs(ctx)

            expect(results.files.length).toBe(1)
            expect(results.files[0].success).toBe(true)

            // Verify file was written to correct location
            const expectedPath = path.join(tempDir, projectName, 'README.md')
            expect(fs.existsSync(expectedPath)).toBe(true)
            expect(fs.readFileSync(expectedPath, 'utf8')).toBe(content)
          },
        ),
        {numRuns: 100},
      )
    })

    it('should write child README to correct path', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          subdirNameArb,
          readmeContentArb,
          async (projectName, subdir, content) => {
            const readme = createReadmePrompt(projectName, content, false, tempDir, subdir)
            const ctx = createMockWriteContext([readme], tempDir, false)

            const results = await plugin.writeProjectOutputs(ctx)

            expect(results.files.length).toBe(1)
            expect(results.files[0].success).toBe(true)

            // Verify file was written to correct location
            const expectedPath = path.join(tempDir, projectName, subdir, 'README.md')
            expect(fs.existsSync(expectedPath)).toBe(true)
            expect(fs.readFileSync(expectedPath, 'utf8')).toBe(content)
          },
        ),
        {numRuns: 100},
      )
    })
  })

  /**
   * Feature: readme-md-plugin, Property 4: Dry-Run Idempotence
   *
   * For any set of README prompts, executing in dry-run mode SHALL NOT create
   * or modify any files on the file system, SHALL return success results for
   * all planned operations, and the reported operations SHALL match what would
   * occur in normal write mode.
   *
   * Validates: Requirements 4.1, 4.2, 4.3
   */
  describe('property 4: Dry-Run Idempotence', () => {
    // Generate valid project names
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate valid subdirectory names
    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate README content
    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    it('should not create any files in dry-run mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          fc.boolean(),
          fc.option(subdirNameArb, {nil: void 0}),
          async (projectName, content, isRoot, subdir) => {
            const readme = createReadmePrompt(
              projectName,
              content,
              isRoot,
              tempDir,
              isRoot ? void 0 : subdir ?? 'subdir',
            )
            const ctx = createMockWriteContext([readme], tempDir, true)

            // Record files before operation
            const filesBefore = fs.readdirSync(tempDir, {recursive: true})

            await plugin.writeProjectOutputs(ctx)

            // Verify no files were created
            const filesAfter = fs.readdirSync(tempDir, {recursive: true})
            expect(filesAfter).toEqual(filesBefore)
          },
        ),
        {numRuns: 100},
      )
    })

    it('should return success results for all planned operations in dry-run mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(projectNameArb, {minLength: 1, maxLength: 5}),
          readmeContentArb,
          async (projectNames, content) => {
            const uniqueProjects = [...new Set(projectNames)]
            const readmes = uniqueProjects.map(name =>
              createReadmePrompt(name, content, true, tempDir),
            )
            const ctx = createMockWriteContext(readmes, tempDir, true)

            const results = await plugin.writeProjectOutputs(ctx)

            // All results should be successful
            expect(results.files.length).toBe(uniqueProjects.length)
            for (const result of results.files) {
              expect(result.success).toBe(true)
              expect(result.skipped).toBe(false)
            }
          },
        ),
        {numRuns: 100},
      )
    })

    it('should report same operations in dry-run and normal mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          async (projectName, content) => {
            const readme = createReadmePrompt(projectName, content, true, tempDir)

            // Run in dry-run mode
            const dryRunCtx = createMockWriteContext([readme], tempDir, true)
            const dryRunResults = await plugin.writeProjectOutputs(dryRunCtx)

            // Run in normal mode
            const normalCtx = createMockWriteContext([readme], tempDir, false)
            const normalResults = await plugin.writeProjectOutputs(normalCtx)

            // Both should report same number of operations
            expect(dryRunResults.files.length).toBe(normalResults.files.length)

            // Both should report same paths
            for (let i = 0; i < dryRunResults.files.length; i++) expect(dryRunResults.files[i].path.path).toBe(normalResults.files[i].path.path)
          },
        ),
        {numRuns: 100},
      )
    })
  })

  /**
   * Feature: readme-md-plugin, Property 5: Clean Operation Completeness
   *
   * For any set of README.md files that were written by the output plugin,
   * the clean operation SHALL register all output file paths and delete
   * exactly those files, continuing with remaining files when individual
   * deletions fail.
   *
   * Validates: Requirements 5.1, 5.2, 5.4
   */
  describe('property 5: Clean Operation Completeness', () => {
    // Generate valid project names
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate valid subdirectory names
    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    // Generate README content
    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    it('should register all output file paths for cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(projectNameArb, {minLength: 1, maxLength: 5}),
          readmeContentArb,
          async (projectNames, content) => {
            const uniqueProjects = [...new Set(projectNames)]
            const readmes = uniqueProjects.map(name =>
              createReadmePrompt(name, content, true, tempDir),
            )
            const ctx = createMockPluginContext(readmes, tempDir)

            const registeredPaths = await plugin.registerProjectOutputFiles(ctx)

            // Should register exactly one path per README
            expect(registeredPaths.length).toBe(uniqueProjects.length)

            // Each path should be a README.md file
            for (const registeredPath of registeredPaths) expect(registeredPath.path.endsWith('README.md')).toBe(true)
          },
        ),
        {numRuns: 100},
      )
    })

    it('should register paths for both root and child READMEs', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          subdirNameArb,
          readmeContentArb,
          async (projectName, subdir, content) => {
            const rootReadme = createReadmePrompt(projectName, content, true, tempDir)
            const childReadme = createReadmePrompt(projectName, content, false, tempDir, subdir)
            const ctx = createMockPluginContext([rootReadme, childReadme], tempDir)

            const registeredPaths = await plugin.registerProjectOutputFiles(ctx)

            expect(registeredPaths.length).toBe(2)

            // Find root and child paths
            const rootPath = registeredPaths.find(p => p.path === path.join(projectName, 'README.md'))
            const childPath = registeredPaths.find(p => p.path === path.join(projectName, subdir, 'README.md'))

            expect(rootPath).toBeDefined()
            expect(childPath).toBeDefined()
          },
        ),
        {numRuns: 100},
      )
    })

    it('should return empty array when no README prompts exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          async () => {
            const ctx = createMockPluginContext([], tempDir)

            const registeredPaths = await plugin.registerProjectOutputFiles(ctx)

            expect(registeredPaths).toEqual([])
          },
        ),
        {numRuns: 100},
      )
    })
  })
})
