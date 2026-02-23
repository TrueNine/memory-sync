import type {
  CollectedInputContext,
  OutputPluginContext,
  OutputWriteContext,
  ReadmeFileKind,
  ReadmePrompt,
  RelativePath,
  Workspace
} from '@truenine/plugin-shared'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {createLogger, FilePathKind, PromptKind, README_FILE_KIND_MAP} from '@truenine/plugin-shared'
import * as fc from 'fast-check'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {ReadmeMdConfigFileOutputPlugin} from './ReadmeMdConfigFileOutputPlugin'

/**
 * Feature: readme-md-plugin
 * Property-based tests for ReadmeMdConfigFileOutputPlugin
 */
describe('readmeMdConfigFileOutputPlugin property tests', () => {
  const plugin = new ReadmeMdConfigFileOutputPlugin()
  let tempDir: string

  const allFileKinds = Object.keys(README_FILE_KIND_MAP) as ReadmeFileKind[]

  beforeEach(() => tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-output-test-')))

  afterEach(() => fs.rmSync(tempDir, {recursive: true, force: true}))

  function createReadmePrompt(
    projectName: string,
    content: string,
    isRoot: boolean,
    basePath: string,
    subdir?: string,
    fileKind: ReadmeFileKind = 'Readme'
  ): ReadmePrompt {
    const targetPath = isRoot ? projectName : path.join(projectName, subdir ?? '')

    const targetDir: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: targetPath,
      basePath,
      getDirectoryName: () => isRoot ? projectName : path.basename(subdir ?? ''),
      getAbsolutePath: () => path.resolve(basePath, targetPath)
    }

    const dir: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: targetPath,
      basePath,
      getDirectoryName: () => isRoot ? projectName : path.basename(subdir ?? ''),
      getAbsolutePath: () => path.resolve(basePath, targetPath)
    }

    return {
      type: PromptKind.Readme,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      projectName,
      targetDir,
      isRoot,
      fileKind,
      markdownContents: [],
      dir
    }
  }

  function createMockPluginContext(
    readmePrompts: readonly ReadmePrompt[],
    basePath: string
  ): OutputPluginContext {
    const workspace: Workspace = {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: basePath,
        getDirectoryName: () => path.basename(basePath),
        getAbsolutePath: () => basePath
      },
      projects: []
    }

    const collectedInputContext: CollectedInputContext = {
      workspace,
      ideConfigFiles: [],
      readmePrompts
    }

    return {
      collectedInputContext,
      logger: createLogger('test', 'error'),
      fs,
      path,
      glob: {} as typeof import('fast-glob')
    }
  }

  function createMockWriteContext(
    readmePrompts: readonly ReadmePrompt[],
    basePath: string,
    dryRun: boolean = false
  ): OutputWriteContext {
    const pluginCtx = createMockPluginContext(readmePrompts, basePath)
    return {
      ...pluginCtx,
      dryRun
    }
  }

  describe('property 3: Output Path Mapping', () => {
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    const fileKindArb = fc.constantFrom(...allFileKinds)

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
              path.join(tempDir, projectName, 'README.md')
            )
          }
        ),
        {numRuns: 100}
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
              path.join(tempDir, projectName, subdir, 'README.md')
            )
          }
        ),
        {numRuns: 100}
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

            const expectedPath = path.join(tempDir, projectName, 'README.md')
            expect(fs.existsSync(expectedPath)).toBe(true)
            expect(fs.readFileSync(expectedPath, 'utf8')).toBe(content)
          }
        ),
        {numRuns: 100}
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

            const expectedPath = path.join(tempDir, projectName, subdir, 'README.md')
            expect(fs.existsSync(expectedPath)).toBe(true)
            expect(fs.readFileSync(expectedPath, 'utf8')).toBe(content)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should register correct output path per fileKind', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          fileKindArb,
          async (projectName, content, fileKind) => {
            const readme = createReadmePrompt(projectName, content, true, tempDir, void 0, fileKind)
            const ctx = createMockPluginContext([readme], tempDir)

            const registeredPaths = await plugin.registerProjectOutputFiles(ctx)
            const expectedFileName = README_FILE_KIND_MAP[fileKind].out

            expect(registeredPaths.length).toBe(1)
            expect(registeredPaths[0].path).toBe(path.join(projectName, expectedFileName))
          }
        ),
        {numRuns: 100}
      )
    })

    it('should write correct output file per fileKind', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          fileKindArb,
          async (projectName, content, fileKind) => {
            const readme = createReadmePrompt(projectName, content, true, tempDir, void 0, fileKind)
            const ctx = createMockWriteContext([readme], tempDir, false)

            const results = await plugin.writeProjectOutputs(ctx)
            const expectedFileName = README_FILE_KIND_MAP[fileKind].out

            expect(results.files.length).toBe(1)
            expect(results.files[0].success).toBe(true)

            const expectedPath = path.join(tempDir, projectName, expectedFileName)
            expect(fs.existsSync(expectedPath)).toBe(true)
            expect(fs.readFileSync(expectedPath, 'utf8')).toBe(content)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should write all three file kinds to separate files in same project', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          async (projectName, content) => {
            const readmes = allFileKinds.map(kind =>
              createReadmePrompt(projectName, `${content}-${kind}`, true, tempDir, void 0, kind)
            )
            const ctx = createMockWriteContext(readmes, tempDir, false)

            const results = await plugin.writeProjectOutputs(ctx)

            expect(results.files.length).toBe(3)
            expect(results.files.every(r => r.success)).toBe(true)

            for (const kind of allFileKinds) {
              const expectedFileName = README_FILE_KIND_MAP[kind].out
              const expectedPath = path.join(tempDir, projectName, expectedFileName)
              expect(fs.existsSync(expectedPath)).toBe(true)
              expect(fs.readFileSync(expectedPath, 'utf8')).toBe(`${content}-${kind}`)
            }
          }
        ),
        {numRuns: 100}
      )
    })
  })

  describe('property 4: Dry-Run Idempotence', () => {
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    const fileKindArb = fc.constantFrom(...allFileKinds)

    it('should not create any files in dry-run mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          fc.boolean(),
          fc.option(subdirNameArb, {nil: void 0}),
          fileKindArb,
          async (projectName, content, isRoot, subdir, fileKind) => {
            const readme = createReadmePrompt(projectName, content, isRoot, tempDir, isRoot ? void 0 : subdir ?? 'subdir', fileKind)
            const ctx = createMockWriteContext([readme], tempDir, true)

            const filesBefore = fs.readdirSync(tempDir, {recursive: true})

            await plugin.writeProjectOutputs(ctx)

            const filesAfter = fs.readdirSync(tempDir, {recursive: true})
            expect(filesAfter).toEqual(filesBefore)
          }
        ),
        {numRuns: 100}
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
              createReadmePrompt(name, content, true, tempDir))
            const ctx = createMockWriteContext(readmes, tempDir, true)

            const results = await plugin.writeProjectOutputs(ctx)

            expect(results.files.length).toBe(uniqueProjects.length)
            for (const result of results.files) {
              expect(result.success).toBe(true)
              expect(result.skipped).toBe(false)
            }
          }
        ),
        {numRuns: 100}
      )
    })

    it('should report same operations in dry-run and normal mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          async (projectName, content) => {
            const readme = createReadmePrompt(projectName, content, true, tempDir)

            const dryRunCtx = createMockWriteContext([readme], tempDir, true)
            const dryRunResults = await plugin.writeProjectOutputs(dryRunCtx)

            const normalCtx = createMockWriteContext([readme], tempDir, false)
            const normalResults = await plugin.writeProjectOutputs(normalCtx)

            expect(dryRunResults.files.length).toBe(normalResults.files.length)

            for (let i = 0; i < dryRunResults.files.length; i++) expect(dryRunResults.files[i].path.path).toBe(normalResults.files[i].path.path)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should not create files in dry-run mode for all fileKinds', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          async (projectName, content) => {
            const readmes = allFileKinds.map(kind =>
              createReadmePrompt(projectName, `${content}-${kind}`, true, tempDir, void 0, kind)
            )
            const ctx = createMockWriteContext(readmes, tempDir, true)

            const filesBefore = fs.readdirSync(tempDir, {recursive: true})

            await plugin.writeProjectOutputs(ctx)

            const filesAfter = fs.readdirSync(tempDir, {recursive: true})
            expect(filesAfter).toEqual(filesBefore)
          }
        ),
        {numRuns: 100}
      )
    })
  })

  describe('property 5: Clean Operation Completeness', () => {
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

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
              createReadmePrompt(name, content, true, tempDir))
            const ctx = createMockPluginContext(readmes, tempDir)

            const registeredPaths = await plugin.registerProjectOutputFiles(ctx)

            expect(registeredPaths.length).toBe(uniqueProjects.length)

            for (const registeredPath of registeredPaths) expect(registeredPath.path.endsWith('README.md')).toBe(true)
          }
        ),
        {numRuns: 100}
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

            const rootPath = registeredPaths.find(p => p.path === path.join(projectName, 'README.md'))
            const childPath = registeredPaths.find(p => p.path === path.join(projectName, subdir, 'README.md'))

            expect(rootPath).toBeDefined()
            expect(childPath).toBeDefined()
          }
        ),
        {numRuns: 100}
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
          }
        ),
        {numRuns: 100}
      )
    })

    it('should register correct paths for all fileKinds', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          async (projectName, content) => {
            const readmes = allFileKinds.map(kind =>
              createReadmePrompt(projectName, `${content}-${kind}`, true, tempDir, void 0, kind)
            )
            const ctx = createMockPluginContext(readmes, tempDir)

            const registeredPaths = await plugin.registerProjectOutputFiles(ctx)

            expect(registeredPaths.length).toBe(3)

            for (const kind of allFileKinds) {
              const expectedFileName = README_FILE_KIND_MAP[kind].out
              const found = registeredPaths.find(p => p.path === path.join(projectName, expectedFileName))
              expect(found).toBeDefined()
            }
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
