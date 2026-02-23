import type {InputPluginContext, PluginOptions, ReadmeFileKind} from '@truenine/plugin-shared'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {createLogger, README_FILE_KIND_MAP} from '@truenine/plugin-shared'
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {ReadmeMdInputPlugin} from './ReadmeMdInputPlugin'

/**
 * Feature: readme-md-plugin
 * Property-based tests for ReadmeMdInputPlugin
 */
describe('readmeMdInputPlugin property tests', () => {
  const plugin = new ReadmeMdInputPlugin()

  const allFileKinds = Object.keys(README_FILE_KIND_MAP) as ReadmeFileKind[]

  function createMockContext(workspaceDir: string, _shadowProjectDir: string): InputPluginContext {
    const options: PluginOptions = {
      workspaceDir,
      shadowSourceProject: {
        name: '.',
        skill: {src: 'src/skills', dist: 'dist/skills'},
        fastCommand: {src: 'src/commands', dist: 'dist/commands'},
        subAgent: {src: 'src/agents', dist: 'dist/agents'},
        rule: {src: 'src/rules', dist: 'dist/rules'},
        globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
        workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
        project: {src: 'app', dist: 'ref'}
      }
    }

    return {
      userConfigOptions: options,
      logger: createLogger('test', 'error'),
      fs,
      path
    }
  }

  function createDirectoryStructure(
    baseDir: string,
    structure: Record<string, string | null>
  ): void {
    for (const [filePath, content] of Object.entries(structure)) {
      const fullPath = path.join(baseDir, filePath)
      const dir = path.dirname(fullPath)

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})

      if (content !== null) fs.writeFileSync(fullPath, content, 'utf8')
    }
  }

  async function withTempDir<T>(fn: (tempDir: string) => Promise<T>): Promise<T> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-test-'))
    try {
      return await fn(tempDir)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  }

  describe('property 1: README Discovery Completeness', () => {
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    const fileKindArb = fc.constantFrom(...allFileKinds)

    it('should discover all rdm.mdx files in generated directory structures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(projectNameArb, {minLength: 1, maxLength: 3}),
          fc.array(subdirNameArb, {minLength: 0, maxLength: 2}),
          fc.boolean(),
          readmeContentArb,
          async (projectNames, subdirs, includeRoot, content) => {
            await withTempDir(async tempDir => {
              const uniqueProjects = [...new Set(projectNames.map(p => p.toLowerCase()))]
              const uniqueSubdirs = [...new Set(subdirs.map(s => s.toLowerCase()))]

              const structure: Record<string, string | null> = {}
              const expectedReadmes: {projectName: string, isRoot: boolean, subdir?: string}[] = []

              for (const projectName of uniqueProjects) {
                structure[`ref/${projectName}/.gitkeep`] = ''

                if (includeRoot) {
                  structure[`ref/${projectName}/rdm.mdx`] = content
                  expectedReadmes.push({projectName, isRoot: true})
                }

                for (const subdir of uniqueSubdirs) {
                  structure[`ref/${projectName}/${subdir}/rdm.mdx`] = content
                  expectedReadmes.push({projectName, isRoot: false, subdir})
                }
              }

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)

              const readmePrompts = result.readmePrompts ?? []

              expect(readmePrompts.length).toBe(expectedReadmes.length)

              for (const expected of expectedReadmes) {
                const found = readmePrompts.find(
                  r =>
                    r.projectName === expected.projectName
                    && r.isRoot === expected.isRoot
                    && r.fileKind === 'Readme'
                )
                expect(found).toBeDefined()
                expect(found?.content).toBe(content)
              }
            })
          }
        ),
        {numRuns: 50}
      )
    })

    it('should return empty result when shadow source directory does not exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          async projectName => {
            await withTempDir(async tempDir => {
              const workspaceDir = path.join(tempDir, projectName)
              fs.mkdirSync(workspaceDir, {recursive: true})

              const ctx = createMockContext(workspaceDir, workspaceDir)
              const result = await plugin.collect(ctx)

              expect(result.readmePrompts).toEqual([])
            })
          }
        ),
        {numRuns: 100}
      )
    })

    it('should discover all three file kinds (rdm.mdx, coc.mdx, security.mdx)', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          readmeContentArb,
          fc.subarray(allFileKinds, {minLength: 1}),
          async (projectName, content, fileKinds) => {
            await withTempDir(async tempDir => {
              const structure: Record<string, string | null> = {}

              for (const kind of fileKinds) {
                const srcFile = README_FILE_KIND_MAP[kind].src
                structure[`ref/${projectName}/${srcFile}`] = `${content}-${kind}`
              }

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              expect(readmePrompts.length).toBe(fileKinds.length)

              for (const kind of fileKinds) {
                const found = readmePrompts.find(r => r.fileKind === kind)
                expect(found).toBeDefined()
                expect(found?.content).toBe(`${content}-${kind}`)
                expect(found?.projectName).toBe(projectName)
                expect(found?.isRoot).toBe(true)
              }
            })
          }
        ),
        {numRuns: 100}
      )
    })

    it('should assign correct fileKind for each source file', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          fileKindArb,
          readmeContentArb,
          async (projectName, fileKind, content) => {
            await withTempDir(async tempDir => {
              const srcFile = README_FILE_KIND_MAP[fileKind].src
              const structure: Record<string, string | null> = {
                [`ref/${projectName}/${srcFile}`]: content
              }

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              expect(readmePrompts.length).toBe(1)
              expect(readmePrompts[0].fileKind).toBe(fileKind)
              expect(readmePrompts[0].content).toBe(content)
            })
          }
        ),
        {numRuns: 100}
      )
    })
  })

  describe('property 2: Data Structure Correctness', () => {
    const projectNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const subdirNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const readmeContentArb = fc.string({minLength: 1, maxLength: 100})
      .filter(s => s.trim().length > 0)

    it('should correctly set isRoot flag based on file location', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          subdirNameArb,
          readmeContentArb,
          readmeContentArb,
          async (projectName, subdir, rootContent, childContent) => {
            await withTempDir(async tempDir => {
              const structure: Record<string, string | null> = {
                [`ref/${projectName}/rdm.mdx`]: rootContent,
                [`ref/${projectName}/${subdir}/rdm.mdx`]: childContent
              }

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              const rootReadme = readmePrompts.find(r => r.isRoot)
              expect(rootReadme).toBeDefined()
              expect(rootReadme?.projectName).toBe(projectName)
              expect(rootReadme?.content).toBe(rootContent)
              expect(rootReadme?.targetDir.path).toBe(projectName)

              const childReadme = readmePrompts.find(r => !r.isRoot)
              expect(childReadme).toBeDefined()
              expect(childReadme?.projectName).toBe(projectName)
              expect(childReadme?.content).toBe(childContent)
              expect(childReadme?.targetDir.path).toBe(path.join(projectName, subdir))
            })
          }
        ),
        {numRuns: 100}
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
                [`ref/${projectName}/rdm.mdx`]: content
              }

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              expect(readmePrompts.length).toBe(1)
              expect(readmePrompts[0].content).toBe(content)
              expect(readmePrompts[0].length).toBe(content.length)
            })
          }
        ),
        {numRuns: 100}
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

              for (const subdir of uniqueSubdirs) structure[`ref/${projectName}/${subdir}/rdm.mdx`] = content

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              for (const readme of readmePrompts) {
                expect(readme.targetDir.basePath).toBe(tempDir)
                expect(readme.targetDir.getAbsolutePath()).toBe(
                  path.resolve(tempDir, readme.targetDir.path)
                )
              }
            })
          }
        ),
        {numRuns: 100}
      )
    })

    it('should discover coc.mdx and security.mdx in child directories', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectNameArb,
          subdirNameArb,
          readmeContentArb,
          async (projectName, subdir, content) => {
            await withTempDir(async tempDir => {
              const structure: Record<string, string | null> = {
                [`ref/${projectName}/${subdir}/coc.mdx`]: `coc-${content}`,
                [`ref/${projectName}/${subdir}/security.mdx`]: `sec-${content}`
              }

              createDirectoryStructure(tempDir, structure)

              const ctx = createMockContext(tempDir, tempDir)
              const result = await plugin.collect(ctx)
              const readmePrompts = result.readmePrompts ?? []

              expect(readmePrompts.length).toBe(2)

              const cocPrompt = readmePrompts.find(r => r.fileKind === 'CodeOfConduct')
              expect(cocPrompt).toBeDefined()
              expect(cocPrompt?.isRoot).toBe(false)
              expect(cocPrompt?.content).toBe(`coc-${content}`)

              const secPrompt = readmePrompts.find(r => r.fileKind === 'Security')
              expect(secPrompt).toBeDefined()
              expect(secPrompt?.isRoot).toBe(false)
              expect(secPrompt?.content).toBe(`sec-${content}`)
            })
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
