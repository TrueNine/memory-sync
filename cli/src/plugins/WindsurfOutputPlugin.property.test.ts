import type {OutputPluginContext, OutputWriteContext} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import {describe, it} from 'vitest'
import {createLogger} from '@/log'
import {FilePathKind, PromptKind} from '@/types'
import {WindsurfOutputPlugin} from './WindsurfOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

class TestableWindsurfOutputPlugin extends WindsurfOutputPlugin {
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }
}

const validNameGen = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // Generators for property-based tests
  .filter(s => /^[\w-]+$/.test(s))
  .map(s => s.toLowerCase())

const skillNameGen = validNameGen.filter(name => name.length > 0 && name !== 'create-rule' && name !== 'create-skill')

const commandNameGen = validNameGen.filter(name => name.length > 0)

const seriesNameGen = fc.option(validNameGen, {nil: void 0})

const fileContentGen = fc.string({minLength: 0, maxLength: 500})

describe('windsurf output plugin property tests', () => {
  describe('registerGlobalOutputDirs', () => {
    it('should always return empty array when no inputs provided', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({minLength: 1}), async _basePath => {
          const plugin = new TestableWindsurfOutputPlugin()
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
          plugin.setMockHomeDir(tempDir)

          const ctx = {
            collectedInputContext: {
              workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
              skills: [],
              fastCommands: []
            }
          } as unknown as OutputPluginContext

          const results = await plugin.registerGlobalOutputDirs(ctx)

          fs.rmSync(tempDir, {recursive: true, force: true})
          return results.length === 0
        })
      )
    })

    it('should always register at least one dir when fastCommands exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          commandNameGen,
          seriesNameGen,
          async (commandName, series) => {
            const plugin = new TestableWindsurfOutputPlugin()
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
            plugin.setMockHomeDir(tempDir)

            const fastCommand = {
              type: PromptKind.FastCommand,
              commandName,
              series,
              content: 'Test content',
              length: 12,
              filePathKind: FilePathKind.Relative,
              dir: createMockRelativePath('.', tempDir),
              markdownContents: [],
              yamlFrontMatter: {description: 'Test command', namingCase: 'kebab-case'}
            }

            const ctx = {
              collectedInputContext: {
                workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
                fastCommands: [fastCommand],
                skills: []
              }
            } as unknown as OutputPluginContext

            const results = await plugin.registerGlobalOutputDirs(ctx)

            fs.rmSync(tempDir, {recursive: true, force: true})
            return results.length >= 1 && results.some(r => r.path === 'global_workflows')
          }
        )
      )
    })

    it('should always register at least one dir when skills exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          skillNameGen,
          async skillName => {
            const plugin = new TestableWindsurfOutputPlugin()
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
            plugin.setMockHomeDir(tempDir)

            const skill = {
              yamlFrontMatter: {name: skillName, description: 'Test skill', namingCase: 'kebab-case'},
              dir: createMockRelativePath(skillName, tempDir),
              content: '# Test Skill',
              length: 12,
              type: PromptKind.Skill,
              filePathKind: FilePathKind.Relative,
              markdownContents: []
            }

            const ctx = {
              collectedInputContext: {
                workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
                skills: [skill],
                fastCommands: []
              }
            } as unknown as OutputPluginContext

            const results = await plugin.registerGlobalOutputDirs(ctx)

            fs.rmSync(tempDir, {recursive: true, force: true})
            return results.length >= 1 && results.some(r => r.path.startsWith('skills'))
          }
        )
      )
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should always return empty array when no inputs provided', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({minLength: 1}), async _basePath => {
          const plugin = new TestableWindsurfOutputPlugin()
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
          plugin.setMockHomeDir(tempDir)

          const ctx = {
            collectedInputContext: {
              workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
              skills: [],
              fastCommands: []
            }
          } as unknown as OutputPluginContext

          const results = await plugin.registerGlobalOutputFiles(ctx)

          fs.rmSync(tempDir, {recursive: true, force: true})
          return results.length === 0
        })
      )
    })

    it('should register one file per fastCommand', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(commandNameGen, {minLength: 1, maxLength: 5}),
          async commandNames => {
            const plugin = new TestableWindsurfOutputPlugin()
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
            plugin.setMockHomeDir(tempDir)

            const fastCommands = commandNames.map(name => ({
              type: PromptKind.FastCommand,
              commandName: name,
              content: 'Test content',
              length: 12,
              filePathKind: FilePathKind.Relative,
              dir: createMockRelativePath('.', tempDir),
              markdownContents: [],
              yamlFrontMatter: {description: 'Test command', namingCase: 'kebab-case'}
            }))

            const ctx = {
              collectedInputContext: {
                workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
                fastCommands,
                skills: []
              }
            } as unknown as OutputPluginContext

            const results = await plugin.registerGlobalOutputFiles(ctx)
            const workflowFiles = results.filter(r => r.path.startsWith('global_workflows'))

            fs.rmSync(tempDir, {recursive: true, force: true})
            return workflowFiles.length === commandNames.length
          }
        )
      )
    })
  })

  describe('canWrite', () => {
    it('should return true when any content exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          async (hasSkills, hasFastCommands, hasGlobalMemory) => {
            if (!hasSkills && !hasFastCommands && !hasGlobalMemory) return true // Skip if all are false

            const plugin = new TestableWindsurfOutputPlugin()
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
            plugin.setMockHomeDir(tempDir)

            const ctx = {
              collectedInputContext: {
                workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
                skills: hasSkills
                  ? [{yamlFrontMatter: {name: 'test-skill', description: 'Test', namingCase: 'kebab-case'}}]
                  : [],
                fastCommands: hasFastCommands
                  ? [{commandName: 'test', yamlFrontMatter: {description: 'Test', namingCase: 'kebab-case'}}]
                  : [],
                globalMemory: hasGlobalMemory
                  ? {content: 'Global rules', length: 12, type: PromptKind.GlobalMemory}
                  : null
              }
            } as unknown as OutputWriteContext

            const result = await plugin.canWrite(ctx)

            fs.rmSync(tempDir, {recursive: true, force: true})
            return result
          }
        )
      )
    })
  })

  describe('writeGlobalOutputs dry-run property', () => {
    it('should not modify filesystem when dryRun is true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fileContentGen,
          async content => {
            const plugin = new TestableWindsurfOutputPlugin()
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
            plugin.setMockHomeDir(tempDir)

            const initialFiles = fs.existsSync(tempDir) // Capture initial state
              ? fs.readdirSync(tempDir)
              : []

            const ctx = {
              collectedInputContext: {
                workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
                globalMemory: {
                  type: PromptKind.GlobalMemory,
                  content,
                  length: content.length,
                  filePathKind: FilePathKind.Relative,
                  dir: createMockRelativePath('.', tempDir),
                  markdownContents: []
                },
                skills: [],
                fastCommands: []
              },
              logger: createLogger('test', 'debug'),
              dryRun: true
            } as unknown as OutputWriteContext

            await plugin.writeGlobalOutputs(ctx)

            const finalFiles = fs.existsSync(tempDir) // Verify filesystem unchanged
              ? fs.readdirSync(tempDir)
              : []

            fs.rmSync(tempDir, {recursive: true, force: true})
            return JSON.stringify(initialFiles) === JSON.stringify(finalFiles)
          }
        )
      )
    })
  })

  describe('writeProjectOutputs', () => {
    it('should always return empty results regardless of input', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          async (hasProjects, hasGlobalMemory) => {
            const plugin = new TestableWindsurfOutputPlugin()
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
            plugin.setMockHomeDir(tempDir)

            const projects = hasProjects
              ? [{name: 'project-a', dirFromWorkspacePath: createMockRelativePath('project-a', tempDir)}]
              : []

            const ctx = {
              collectedInputContext: {
                workspace: {projects, directory: createMockRelativePath('.', tempDir)},
                globalMemory: hasGlobalMemory
                  ? {content: 'Global rules', length: 12, type: PromptKind.GlobalMemory}
                  : null
              },
              logger: createLogger('test', 'debug'),
              dryRun: false
            } as unknown as OutputWriteContext

            const results = await plugin.writeProjectOutputs(ctx)

            fs.rmSync(tempDir, {recursive: true, force: true})
            return results.files.length === 0 && results.dirs.length === 0
          }
        )
      )
    })
  })

  describe('output path consistency', () => {
    it('should generate consistent base paths for all outputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          skillNameGen,
          commandNameGen,
          async (skillName, commandName) => {
            const plugin = new TestableWindsurfOutputPlugin()
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-prop-'))
            plugin.setMockHomeDir(tempDir)

            const skill = {
              yamlFrontMatter: {name: skillName, description: 'Test skill', namingCase: 'kebab-case'},
              dir: createMockRelativePath(skillName, tempDir),
              content: '# Test Skill',
              length: 12,
              type: PromptKind.Skill,
              filePathKind: FilePathKind.Relative,
              markdownContents: []
            }

            const fastCommand = {
              type: PromptKind.FastCommand,
              commandName,
              content: 'Test content',
              length: 12,
              filePathKind: FilePathKind.Relative,
              dir: createMockRelativePath('.', tempDir),
              markdownContents: [],
              yamlFrontMatter: {description: 'Test command', namingCase: 'kebab-case'}
            }

            const ctx = {
              collectedInputContext: {
                workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
                skills: [skill],
                fastCommands: [fastCommand]
              }
            } as unknown as OutputPluginContext

            const dirs = await plugin.registerGlobalOutputDirs(ctx)
            const files = await plugin.registerGlobalOutputFiles(ctx)

            const basePaths = [...dirs, ...files].map(r => r.basePath)
            const allSameBase = basePaths.every(bp => bp === basePaths[0])

            fs.rmSync(tempDir, {recursive: true, force: true})
            return allSameBase && basePaths[0].includes('.codeium')
          }
        )
      )
    })
  })
})
