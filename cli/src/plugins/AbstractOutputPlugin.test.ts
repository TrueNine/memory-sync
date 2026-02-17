import type {
  AIAgentIgnoreConfigFile,
  FastCommandPrompt,
  OutputWriteContext,
  PluginOptions,
  Project,
  RelativePath,
  WriteResult
} from '../types'
import type {FastCommandNameTransformOptions} from './AbstractOutputPlugin'

import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {FilePathKind, PromptKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

class TestOutputPlugin extends AbstractOutputPlugin { // Create a concrete test implementation
  constructor(pluginName: string = 'TestOutputPlugin') {
    super(pluginName, {outputFileName: 'TEST.md'})
  }

  public testExtractGlobalMemoryContent(ctx: OutputWriteContext) { // Expose protected methods for testing
    return this.extractGlobalMemoryContent(ctx)
  }

  public testCombineGlobalWithContent(
    globalContent: string | undefined,
    projectContent: string,
    options?: any
  ) {
    return this.combineGlobalWithContent(globalContent, projectContent, options)
  }

  public testTransformFastCommandName(
    cmd: FastCommandPrompt,
    options?: FastCommandNameTransformOptions
  ) {
    return this.transformFastCommandName(cmd, options)
  }

  public testGetFastCommandSeriesOptions(ctx: OutputWriteContext) {
    return this.getFastCommandSeriesOptions(ctx)
  }

  public testGetTransformOptionsFromContext(
    ctx: OutputWriteContext,
    additionalOptions?: FastCommandNameTransformOptions
  ) {
    return this.getTransformOptionsFromContext(ctx, additionalOptions)
  }

  public async testWriteProjectIgnoreFiles(ctx: OutputWriteContext): Promise<WriteResult[]> {
    return this.writeProjectIgnoreFiles(ctx)
  }

  public testRegisterProjectIgnoreOutputFiles(projects: readonly Project[]): RelativePath[] {
    return this.registerProjectIgnoreOutputFiles(projects)
  }
}

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => `${basePath}/${pathStr}`
  }
}

function createMockFastCommandPrompt(
  series: string | undefined,
  commandName: string
): FastCommandPrompt {
  return {
    type: PromptKind.FastCommand,
    series,
    commandName,
    content: '',
    length: 0,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', '/test'),
    markdownContents: []
  } as FastCommandPrompt
}

function createMockContext(globalContent?: string, pluginOptions?: PluginOptions): OutputWriteContext {
  const hasGlobalContent = globalContent != null && globalContent.trim().length > 0
  return {
    collectedInputContext: {
      workspace: {
        directory: createMockRelativePath('.', '/test'),
        projects: []
      },
      ideConfigFiles: [],
      globalMemory: hasGlobalContent
        ? {
            type: PromptKind.GlobalMemory,
            content: globalContent,
            dir: createMockRelativePath('.', '/test'),
            markdownContents: [],
            length: globalContent.length,
            filePathKind: FilePathKind.Relative,
            parentDirectoryPath: {
              type: 'UserHome',
              directory: createMockRelativePath('.memory', '/home/user')
            }
          } as any
        : (null as any)
    } as any,
    dryRun: false,
    pluginOptions
  } as unknown as OutputWriteContext
}

describe('abstractOutputPlugin', () => {
  describe('extractGlobalMemoryContent', () => {
    it('should extract global memory content when present', () => {
      const plugin = new TestOutputPlugin()
      const ctx = createMockContext('Global content here')

      const result = plugin.testExtractGlobalMemoryContent(ctx)

      expect(result).toBe('Global content here')
    })

    it('should return undefined when global memory is not present', () => {
      const plugin = new TestOutputPlugin()
      const ctx = createMockContext()

      const result = plugin.testExtractGlobalMemoryContent(ctx)

      expect(result).toBeUndefined()
    })

    it('should return undefined when global memory content is undefined', () => {
      const plugin = new TestOutputPlugin()
      const ctx = createMockContext();
      (ctx.collectedInputContext as any).globalMemory = {
        type: PromptKind.GlobalMemory,
        dir: createMockRelativePath('.', '/test'),
        markdownContents: [],
        length: 0,
        filePathKind: FilePathKind.Relative,
        parentDirectoryPath: {
          type: 'UserHome',
          directory: createMockRelativePath('.memory', '/home/user')
        }
      } as any

      const result = plugin.testExtractGlobalMemoryContent(ctx)

      expect(result).toBeUndefined()
    })
  })

  describe('combineGlobalWithContent', () => {
    it('should combine global and project content with default options', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project')

      expect(result).toBe('Global\n\nProject')
    })

    it('should skip empty global content by default', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('', 'Project')

      expect(result).toBe('Project')
    })

    it('should skip whitespace-only global content by default', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('   \n\n  ', 'Project')

      expect(result).toBe('Project')
    })

    it('should skip undefined global content by default', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent(null as any, 'Project')

      expect(result).toBe('Project')
    })

    it('should use custom separator when provided', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project', {separator: '\n---\n'})

      expect(result).toBe('Global\n---\nProject')
    })

    it('should place global content after when position is "after"', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project', {position: 'after'})

      expect(result).toBe('Project\n\nGlobal')
    })

    it('should place global content before when position is "before"', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project', {position: 'before'})

      expect(result).toBe('Global\n\nProject')
    })

    it('should not skip empty content when skipIfEmpty is false', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('', 'Project', {skipIfEmpty: false})

      expect(result).toBe('\n\nProject')
    })

    it('should not skip whitespace content when skipIfEmpty is false', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent(' ', 'Project', {skipIfEmpty: false})

      expect(result).toBe(' \n\nProject')
    })

    it('should treat undefined as empty string when skipIfEmpty is false', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent(null as any, 'Project', {skipIfEmpty: false})

      expect(result).toBe('\n\nProject')
    })

    it('should combine multiple options correctly', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project', {separator: '\n===\n', position: 'after', skipIfEmpty: true})

      expect(result).toBe('Project\n===\nGlobal')
    })

    it('should handle multi-line content correctly', () => {
      const plugin = new TestOutputPlugin()
      const globalContent = '# Global Rules\n\nThese are global.'
      const projectContent = '# Project Rules\n\nThese are project-specific.'
      const result = plugin.testCombineGlobalWithContent(globalContent, projectContent)

      expect(result).toBe(
        '# Global Rules\n\nThese are global.\n\n# Project Rules\n\nThese are project-specific.'
      )
    })
  })

  describe('transformFastCommandName', () => {
    const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'}) // Generator for alphanumeric strings without underscore (for series prefix)
      .filter(s => /^[a-z0-9]+$/i.test(s))

    const alphanumericCommandName = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // Generator for alphanumeric strings (for command name)
      .filter(s => /^\w+$/.test(s))

    const separatorChar = fc.constantFrom('_', '-', '.', '~') // Generator for separator characters

    it('should include series prefix with default separator when includeSeriesPrefix is true or undefined', () => {
      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericCommandName,
          (series, commandName) => {
            const plugin = new TestOutputPlugin()
            const cmd = createMockFastCommandPrompt(series, commandName)

            const resultTrue = plugin.testTransformFastCommandName(cmd, {includeSeriesPrefix: true}) // Test with includeSeriesPrefix = true
            expect(resultTrue).toBe(`${series}-${commandName}.md`)

            const resultDefault = plugin.testTransformFastCommandName(cmd) // Test with includeSeriesPrefix = undefined (default)
            expect(resultDefault).toBe(`${series}-${commandName}.md`)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should exclude series prefix when includeSeriesPrefix is false', () => {
      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericCommandName,
          (series, commandName) => {
            const plugin = new TestOutputPlugin()
            const cmd = createMockFastCommandPrompt(series, commandName)

            const result = plugin.testTransformFastCommandName(cmd, {includeSeriesPrefix: false})
            expect(result).toBe(`${commandName}.md`)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should use configurable separator between series and command name', () => {
      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericCommandName,
          separatorChar,
          (series, commandName, separator) => {
            const plugin = new TestOutputPlugin()
            const cmd = createMockFastCommandPrompt(series, commandName)

            const result = plugin.testTransformFastCommandName(cmd, {includeSeriesPrefix: true, seriesSeparator: separator})
            expect(result).toBe(`${series}${separator}${commandName}.md`)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return just commandName.md when series is undefined', () => {
      fc.assert(
        fc.property(
          alphanumericCommandName,
          fc.boolean(),
          separatorChar,
          (commandName, includePrefix, separator) => {
            const plugin = new TestOutputPlugin()
            const cmd = createMockFastCommandPrompt(void 0, commandName)

            const result = plugin.testTransformFastCommandName(cmd, { // Regardless of includeSeriesPrefix setting, should return just commandName
              includeSeriesPrefix: includePrefix,
              seriesSeparator: separator
            })
            expect(result).toBe(`${commandName}.md`)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should handle pe_compile correctly with default options', () => { // Unit tests for specific edge cases
      const plugin = new TestOutputPlugin()
      const cmd = createMockFastCommandPrompt('pe', 'compile')

      const result = plugin.testTransformFastCommandName(cmd)
      expect(result).toBe('pe-compile.md')
    })

    it('should handle pe_compile with hyphen separator (Kiro style)', () => {
      const plugin = new TestOutputPlugin()
      const cmd = createMockFastCommandPrompt('pe', 'compile')

      const result = plugin.testTransformFastCommandName(cmd, {seriesSeparator: '-'})
      expect(result).toBe('pe-compile.md')
    })

    it('should handle command without series', () => {
      const plugin = new TestOutputPlugin()
      const cmd = createMockFastCommandPrompt(void 0, 'compile')

      const result = plugin.testTransformFastCommandName(cmd)
      expect(result).toBe('compile.md')
    })

    it('should strip prefix when includeSeriesPrefix is false', () => {
      const plugin = new TestOutputPlugin()
      const cmd = createMockFastCommandPrompt('pe', 'compile')

      const result = plugin.testTransformFastCommandName(cmd, {includeSeriesPrefix: false})
      expect(result).toBe('compile.md')
    })
  })

  describe('getFastCommandSeriesOptions and getTransformOptionsFromContext', () => {
    const pluginNameGen = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // Generator for plugin names
      .filter(s => /^[a-z][a-z0-9]*$/i.test(s))

    const separatorGen = fc.constantFrom('_', '-', '.', '~') // Generator for separator characters

    it('should return plugin-specific override when it exists', () => {
      fc.assert(
        fc.property(
          pluginNameGen,
          fc.boolean(),
          separatorGen,
          fc.boolean(),
          separatorGen,
          (pluginName, globalInclude, _globalSep, pluginInclude, pluginSep) => {
            const plugin = new TestOutputPlugin(pluginName)
            const ctx = createMockContext(void 0, {
              fastCommandSeriesOptions: {
                includeSeriesPrefix: globalInclude,
                pluginOverrides: {
                  [pluginName]: {
                    includeSeriesPrefix: pluginInclude,
                    seriesSeparator: pluginSep
                  }
                }
              }
            })

            const result = plugin.testGetFastCommandSeriesOptions(ctx)

            expect(result.includeSeriesPrefix).toBe(pluginInclude) // Plugin-specific override should take precedence
            expect(result.seriesSeparator).toBe(pluginSep)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should fall back to global settings when no plugin override exists', () => {
      fc.assert(
        fc.property(
          pluginNameGen,
          fc.boolean(),
          (pluginName, globalInclude) => {
            const plugin = new TestOutputPlugin(pluginName)
            const ctx = createMockContext(void 0, {
              fastCommandSeriesOptions: {
                includeSeriesPrefix: globalInclude
              }
            })

            const result = plugin.testGetFastCommandSeriesOptions(ctx)

            expect(result.includeSeriesPrefix).toBe(globalInclude) // Should use global setting
            expect(result.seriesSeparator).not.toBeDefined() // seriesSeparator should not be set
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return empty options when no configuration exists', () => {
      fc.assert(
        fc.property(
          pluginNameGen,
          pluginName => {
            const plugin = new TestOutputPlugin(pluginName)
            const ctx = createMockContext()

            const result = plugin.testGetFastCommandSeriesOptions(ctx)

            expect(result.includeSeriesPrefix).not.toBeDefined()
            expect(result.seriesSeparator).not.toBeDefined()
          }
        ),
        {numRuns: 100}
      )
    })

    it('should merge additionalOptions with config options in getTransformOptionsFromContext', () => {
      fc.assert(
        fc.property(
          pluginNameGen,
          fc.boolean(),
          separatorGen,
          separatorGen,
          (pluginName, configInclude, configSep, additionalSep) => {
            const plugin = new TestOutputPlugin(pluginName)
            const ctx = createMockContext(void 0, {
              fastCommandSeriesOptions: {
                includeSeriesPrefix: configInclude,
                pluginOverrides: {
                  [pluginName]: {
                    seriesSeparator: configSep
                  }
                }
              }
            })

            const result = plugin.testGetTransformOptionsFromContext(ctx, { // Config separator should override additional options
              seriesSeparator: additionalSep
            })

            expect(result.includeSeriesPrefix).toBe(configInclude)
            expect(result.seriesSeparator).toBe(configSep) // Config separator takes precedence over additional options
          }
        ),
        {numRuns: 100}
      )
    })

    it('should use additionalOptions when config does not specify the option', () => {
      fc.assert(
        fc.property(
          pluginNameGen,
          fc.boolean(),
          separatorGen,
          (pluginName, additionalInclude, additionalSep) => {
            const plugin = new TestOutputPlugin(pluginName)
            const ctx = createMockContext() // No fastCommandSeriesOptions in config

            const result = plugin.testGetTransformOptionsFromContext(ctx, {includeSeriesPrefix: additionalInclude, seriesSeparator: additionalSep})

            expect(result.includeSeriesPrefix).toBe(additionalInclude) // Should use additional options as fallback
            expect(result.seriesSeparator).toBe(additionalSep)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should handle KiroCLIOutputPlugin style configuration', () => { // Unit tests for specific scenarios
      const plugin = new TestOutputPlugin('KiroCLIOutputPlugin')
      const ctx = createMockContext(void 0, {
        fastCommandSeriesOptions: {
          includeSeriesPrefix: false,
          pluginOverrides: {
            KiroCLIOutputPlugin: {
              includeSeriesPrefix: true,
              seriesSeparator: '-'
            }
          }
        }
      })

      const result = plugin.testGetFastCommandSeriesOptions(ctx)

      expect(result.includeSeriesPrefix).toBe(true) // Plugin override should take precedence
      expect(result.seriesSeparator).toBe('-')
    })

    it('should handle partial plugin override (only seriesSeparator)', () => {
      const plugin = new TestOutputPlugin('TestPlugin')
      const ctx = createMockContext(void 0, {
        fastCommandSeriesOptions: {
          includeSeriesPrefix: true,
          pluginOverrides: {
            TestPlugin: {
              seriesSeparator: '-'
            }
          }
        }
      })

      const result = plugin.testGetFastCommandSeriesOptions(ctx)

      expect(result.includeSeriesPrefix).toBe(true) // includeSeriesPrefix should fall back to global
      expect(result.seriesSeparator).toBe('-')
    })
  })

  describe('indexignore helpers', () => {
    function createIgnoreContext(
      ignoreFileName: string | undefined,
      projects: readonly Project[]
    ): OutputWriteContext {
      const collectedInputContext: any = {
        workspace: {
          directory: createMockRelativePath('.', '/test'),
          projects
        },
        ideConfigFiles: [],
        aiAgentIgnoreConfigFiles: ignoreFileName == null
          ? []
          : [{fileName: ignoreFileName, content: 'ignore patterns'}]
      }

      return {
        collectedInputContext,
        dryRun: true
      } as unknown as OutputWriteContext
    }

    it('registerProjectIgnoreOutputFiles should return empty array when no indexignore is configured', () => {
      const plugin = new TestOutputPlugin()
      const projects: Project[] = [
        {
          name: 'p1',
          dirFromWorkspacePath: createMockRelativePath('project1', '/ws')
        } as any
      ]

      const results = plugin.testRegisterProjectIgnoreOutputFiles(projects)
      expect(results).toHaveLength(0)
    })

    it('registerProjectIgnoreOutputFiles should register ignore file paths for each non-prompt project', () => {
      const plugin = new TestOutputPlugin('IgnoreTestPlugin')
      ;(plugin as any).indexignore = '.cursorignore'

      const projects: Project[] = [
        {
          name: 'regular',
          dirFromWorkspacePath: createMockRelativePath('project1', '/ws')
        } as any,
        {
          name: 'prompt-src',
          isPromptSourceProject: true,
          dirFromWorkspacePath: createMockRelativePath('prompt-src', '/ws')
        } as any
      ]

      const results = plugin.testRegisterProjectIgnoreOutputFiles(projects)
      const paths = results.map(r => r.path.replaceAll('\\', '/'))
      expect(paths).toEqual(['project1/.cursorignore'])
    })

    it('writeProjectIgnoreFiles should write matching ignore file in dry-run mode', async () => {
      const plugin = new TestOutputPlugin('IgnoreTestPlugin')
      ;(plugin as any).indexignore = '.cursorignore'

      const projects: Project[] = [
        {
          name: 'regular',
          dirFromWorkspacePath: createMockRelativePath('project1', '/ws')
        } as any
      ]

      const ctx = createIgnoreContext('.cursorignore', projects)
      const results = await plugin.testWriteProjectIgnoreFiles(ctx)

      expect(results).toHaveLength(1)
      const first = results[0]!
      expect(first.success).toBe(true)
      expect(first.skipped).toBe(false)
      expect(first.path.path.replaceAll('\\', '/')).toBe('project1/.cursorignore')
    })

    it('writeProjectIgnoreFiles should skip when no matching ignore file exists', async () => {
      const plugin = new TestOutputPlugin('IgnoreTestPlugin')
      ;(plugin as any).indexignore = '.cursorignore'

      const projects: Project[] = [
        {
          name: 'regular',
          dirFromWorkspacePath: createMockRelativePath('project1', '/ws')
        } as any
      ]

      const ctx = createIgnoreContext('.otherignore', projects)
      const results = await plugin.testWriteProjectIgnoreFiles(ctx)

      expect(results).toHaveLength(0)
    })

    it('registerProjectIgnoreOutputFiles should never create entries for projects without dirFromWorkspacePath', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), {minLength: 0, maxLength: 5}),
          flags => {
            const plugin = new TestOutputPlugin('IgnoreTestPlugin')
            ;(plugin as any).indexignore = '.cursorignore'

            const projects: Project[] = flags.map((hasDir, idx) => {
              if (!hasDir) {
                return {
                  name: `p${idx}`
                } as Project
              }
              return {
                name: `p${idx}`,
                dirFromWorkspacePath: createMockRelativePath(`project${idx}`, '/ws')
              } as Project
            })

            const results = plugin.testRegisterProjectIgnoreOutputFiles(projects)
            const maxExpected = projects.filter(
              p => p.dirFromWorkspacePath != null && p.isPromptSourceProject !== true
            ).length

            expect(results.length).toBeLessThanOrEqual(maxExpected)
            for (const r of results) expect(r.path.endsWith('.cursorignore')).toBe(true)
          }
        ),
        {numRuns: 50}
      )
    })

    it('writeProjectIgnoreFiles should either write for all eligible projects or none, depending on presence of matching ignore file', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), {minLength: 0, maxLength: 5}),
          fc.boolean(),
          async (hasDirFlags, includeMatchingIgnore) => {
            const plugin = new TestOutputPlugin('IgnoreTestPlugin')
            ;(plugin as any).indexignore = '.cursorignore'

            const projects: Project[] = hasDirFlags.map((hasDir, idx) => {
              if (!hasDir) {
                return {
                  name: `p${idx}`
                } as Project
              }

              const isPromptSourceProject = idx % 2 === 1
              return {
                name: `p${idx}`,
                dirFromWorkspacePath: createMockRelativePath(`project${idx}`, '/ws'),
                isPromptSourceProject
              } as Project
            })

            const ignoreFiles: AIAgentIgnoreConfigFile[] = includeMatchingIgnore
              ? [{fileName: '.cursorignore', content: 'patterns'}]
              : [{fileName: '.otherignore', content: 'other'}]

            const ctx: OutputWriteContext = {
              collectedInputContext: {
                workspace: {
                  directory: createMockRelativePath('.', '/ws'),
                  projects
                },
                ideConfigFiles: [],
                aiAgentIgnoreConfigFiles: ignoreFiles
              } as any,
              dryRun: true
            } as any

            const results = await plugin.testWriteProjectIgnoreFiles(ctx)

            const eligibleCount = projects.filter(
              p => p.dirFromWorkspacePath != null && p.isPromptSourceProject !== true
            ).length

            if (!includeMatchingIgnore || eligibleCount === 0) expect(results.length).toBe(0)
            else expect(results.length).toBe(eligibleCount)
          }
        ),
        {numRuns: 50}
      )
    })
  })
})
