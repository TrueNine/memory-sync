import type {OutputWriteContext, RulePrompt} from './adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from './adaptor-core'
import {TraeOutputAdaptor, validateTraeCnConfig} from './TraeOutputAdaptor'

function createRulePrompt(ruleName: string, content: string, globs: string[]): RulePrompt {
  return {
    type: PromptKind.Rule,
    prefix: 'test',
    ruleName,
    globs,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    filePath: {
      pathKind: FilePathKind.Relative,
      path: `src/rules/${ruleName}.src.mdx`,
      basePath: path.resolve('tmp/aindex'),
      getDirectoryName: () => 'rules',
      getAbsolutePath: () => path.resolve('tmp/aindex/src/rules', `${ruleName}.src.mdx`)
    }
  } as RulePrompt
}

describe('traeOutputAdaptor rules output', () => {
  it('outputs rules to aindex/dist/rules', async () => {
    const plugin = new TraeOutputAdaptor()
    const workspaceBase = path.resolve('tmp/trae-rules-test')
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [
            {
              name: '__workspace__',
              isWorkspaceRootProject: true
            } as never
          ]
        },
        rules: [createRulePrompt('test-rule', 'Rule content', ['src/**/*.ts'])]
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const ruleDecl = declarations.find(d => d.source != null && (d.source as {kind?: string}).kind === 'rule')
    expect(ruleDecl).toBeDefined()
    expect(ruleDecl?.path).toContain('.trae/rules/rule-test-test-rule.md')
  })

  it('outputs rules to .trae/rules', async () => {
    const plugin = new TraeOutputAdaptor()
    const workspaceBase = path.resolve('tmp/trae-rules-custom')
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [
            {
              name: '__workspace__',
              isWorkspaceRootProject: true
            } as never
          ]
        },
        rules: [createRulePrompt('custom-rule', 'Custom rule content', ['**/*.js'])]
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const ruleDecl = declarations.find(d => d.source != null && (d.source as {kind?: string}).kind === 'rule')
    expect(ruleDecl).toBeDefined()
    expect(ruleDecl?.path).toContain('.trae/rules/rule-test-custom-rule.md')
  })

  it('outputs multiple rules', async () => {
    const plugin = new TraeOutputAdaptor()
    const workspaceBase = path.resolve('tmp/trae-multi-rules')
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [
            {
              name: '__workspace__',
              isWorkspaceRootProject: true
            } as never
          ]
        },
        rules: [createRulePrompt('rule-a', 'Rule A content', ['src/**/*.ts']), createRulePrompt('rule-b', 'Rule B content', ['test/**/*.ts'])]
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const ruleDecls = declarations.filter(d => d.source != null && (d.source as {kind?: string}).kind === 'rule')
    expect(ruleDecls).toHaveLength(2)
    expect(ruleDecls[0]?.path).toContain('.trae/rules/rule-test-rule-a.md')
    expect(ruleDecls[1]?.path).toContain('.trae/rules/rule-test-rule-b.md')
  })
})

describe('traeOutputAdaptor global memory output', () => {
  it('outputs global memory to both .trae and .trae-cn paths when enabled', async () => {
    const plugin = new TraeOutputAdaptor({enableTraeCn: true})
    const workspaceBase = path.resolve('tmp/trae-global-test')
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: []
        },
        globalMemory: {
          type: PromptKind.GlobalMemory,
          content: '# Global Memory Content',
          length: 24,
          filePathKind: FilePathKind.Absolute,
          filePath: '/test/global.md'
        }
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)

    const traeGlobal = declarations.find(d => d.scope === 'global' && d.path.includes('.trae/steering/GLOBAL.md'))
    expect(traeGlobal).toBeDefined()

    const traeCnGlobal = declarations.find(d => d.scope === 'global' && d.path.includes('.trae-cn/user_rules/GLOBAL.md'))
    expect(traeCnGlobal).toBeDefined()

    const traeSource = traeGlobal?.source as {kind: string, content: string}
    const traeCnSource = traeCnGlobal?.source as {kind: string, content: string}
    expect(traeSource?.content).toBe('# Global Memory Content')
    expect(traeCnSource?.content).toBe('# Global Memory Content')
    expect(traeSource?.kind).toBe('globalMemory')
    expect(traeCnSource?.kind).toBe('globalMemoryCn')
  })

  it('outputs only to .trae path when TraeCN is disabled', async () => {
    const plugin = new TraeOutputAdaptor({enableTraeCn: false})
    const workspaceBase = path.resolve('tmp/trae-only-test')
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: []
        },
        globalMemory: {
          type: PromptKind.GlobalMemory,
          content: '# Global Memory Content',
          length: 24,
          filePathKind: FilePathKind.Absolute,
          filePath: '/test/global.md'
        }
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)

    const traeGlobal = declarations.find(d => d.scope === 'global' && d.path.includes('.trae/steering/GLOBAL.md'))
    expect(traeGlobal).toBeDefined()

    const traeCnGlobal = declarations.find(d => d.scope === 'global' && d.path.includes('.trae-cn/user_rules/GLOBAL.md'))
    expect(traeCnGlobal).toBeUndefined()
  })
})

describe('validateTraeCnConfig', () => {
  it('returns valid for undefined config', () => {
    const result = validateTraeCnConfig(void 0)
    expect(result.valid).toBe(true)
  })

  it('returns valid for empty config', () => {
    const result = validateTraeCnConfig({})
    expect(result.valid).toBe(true)
  })

  it('returns valid for boolean traeCn config', () => {
    expect(validateTraeCnConfig({traeCn: true}).valid).toBe(true)
    expect(validateTraeCnConfig({traeCn: false}).valid).toBe(true)
  })

  it('returns valid for boolean trae config', () => {
    expect(validateTraeCnConfig({trae: true}).valid).toBe(true)
    expect(validateTraeCnConfig({trae: false}).valid).toBe(true)
  })

  it('returns error for non-boolean traeCn config', () => {
    const result = validateTraeCnConfig({traeCn: 'true' as unknown as boolean})
    expect(result.valid).toBe(false)
    expect(result.error).toContain('traeCn 配置项必须为 boolean 类型')
  })

  it('returns error for non-boolean trae config', () => {
    const result = validateTraeCnConfig({trae: 1 as unknown as boolean})
    expect(result.valid).toBe(false)
    expect(result.error).toContain('trae 配置项必须为 boolean 类型')
  })

  it('returns warning when both trae and traeCn are enabled', () => {
    const warnFn = vi.fn()
    const result = validateTraeCnConfig({trae: true, traeCn: true}, {warn: warnFn})
    expect(result.valid).toBe(true)
    expect(result.warning).toContain('同时启用 trae 和 traeCn 可能导致重复输出')
    expect(warnFn).toHaveBeenCalledWith(expect.objectContaining({code: 'TRAECN_DUPLICATE_WARNING'}))
  })

  it('does not warn when only one is enabled', () => {
    const warnFn = vi.fn()
    validateTraeCnConfig({trae: true, traeCn: false}, {warn: warnFn})
    expect(warnFn).not.toHaveBeenCalled()

    warnFn.mockClear()
    validateTraeCnConfig({trae: false, traeCn: true}, {warn: warnFn})
    expect(warnFn).not.toHaveBeenCalled()
  })
})

describe('traeOutputAdaptor cleanup configuration', () => {
  it('declares cleanup paths for both .trae and .trae-cn directories', async () => {
    const plugin = new TraeOutputAdaptor()
    const workspaceBase = path.resolve('tmp/trae-cleanup-test')

    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [
            {
              name: 'project-a',
              dirFromWorkspacePath: {
                pathKind: FilePathKind.Relative,
                path: 'project-a',
                basePath: workspaceBase,
                getDirectoryName: () => 'project-a',
                getAbsolutePath: () => path.join(workspaceBase, 'project-a')
              }
            }
          ]
        }
      }
    } as unknown as OutputWriteContext

    const cleanupPaths = await plugin.declareCleanupPaths(ctx)
    expect(cleanupPaths.delete).toBeDefined()

    const deletePaths = cleanupPaths.delete ?? []
    const globalDeleteDirs = deletePaths.filter(p => p.scope === 'global')

    expect(globalDeleteDirs.some(p => p.path.includes('.trae/steering'))).toBe(true)
    expect(globalDeleteDirs.some(p => p.path.includes('.trae-cn/user_rules'))).toBe(true)
    expect(globalDeleteDirs.some(p => p.path.includes('.trae/commands'))).toBe(true)
    expect(globalDeleteDirs.some(p => p.path.includes('.trae/skills'))).toBe(true)
    expect(globalDeleteDirs.some(p => p.path.includes('.trae/rules'))).toBe(true)
  })
})

describe('traeOutputAdaptor convertContent', () => {
  it('converts globalMemory source to content string', async () => {
    const plugin = new TraeOutputAdaptor()
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: '/tmp'
          },
          projects: []
        }
      }
    } as unknown as OutputWriteContext

    const declaration = {
      path: '/test/GLOBAL.md',
      scope: 'global' as const,
      source: {kind: 'globalMemory' as const, content: '# Test Content'}
    }

    const result = await plugin.convertContent(declaration, ctx)
    expect(result).toBe('# Test Content')
  })

  it('converts globalMemoryCn source to content string', async () => {
    const plugin = new TraeOutputAdaptor()
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: '/tmp'
          },
          projects: []
        }
      }
    } as unknown as OutputWriteContext

    const declaration = {
      path: '/test/GLOBAL.md',
      scope: 'global' as const,
      source: {kind: 'globalMemoryCn' as const, content: '# CN Content'}
    }

    const result = await plugin.convertContent(declaration, ctx)
    expect(result).toBe('# CN Content')
  })

  it('converts rule source to content string', async () => {
    const plugin = new TraeOutputAdaptor()
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: '/tmp'
          },
          projects: []
        }
      }
    } as unknown as OutputWriteContext

    const rule = createRulePrompt('test-rule', 'Rule body content', ['src/**/*.ts'])
    const declaration = {
      path: '/test/rule.md',
      scope: 'project' as const,
      source: {kind: 'rule' as const, rule}
    }

    const result = await plugin.convertContent(declaration, ctx)
    expect(result).toContain('Rule body content')
    expect(result).toContain('globs:')
    expect(result).toContain('src/**/*.ts')
  })

  it('throws error for unsupported declaration source', async () => {
    const plugin = new TraeOutputAdaptor()
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: '/tmp'
          },
          projects: []
        }
      }
    } as unknown as OutputWriteContext

    const unknownSource = {kind: 'unknownType' as string, content: 'test'}
    const declaration = {
      path: '/test/unknown.md',
      scope: 'global' as const,
      source: unknownSource
    }

    await expect(plugin.convertContent(declaration, ctx)).rejects.toThrow('Unsupported declaration source')
  })
})

describe('traeOutputAdaptor ignore file output', () => {
  it('outputs .traeignore as .trae/.ignore', async () => {
    const plugin = new TraeOutputAdaptor()
    const workspaceBase = path.resolve('tmp/trae-ignore-test')
    const ctx = {
      logger: createLogger('TraeOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [
            {
              name: 'project-a',
              dirFromWorkspacePath: {
                pathKind: FilePathKind.Relative,
                path: 'project-a',
                basePath: workspaceBase,
                getDirectoryName: () => 'project-a',
                getAbsolutePath: () => path.join(workspaceBase, 'project-a')
              },
              isPromptSourceProject: false
            }
          ]
        },
        aiAgentIgnoreConfigFiles: [
          {
            fileName: '.traeignore',
            content: 'node_modules\ndist'
          }
        ]
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const ignoreDecl = declarations.find(d => d.source != null && (d.source as {kind?: string}).kind === 'ignoreFile')

    expect(ignoreDecl).toBeDefined()
    expect(ignoreDecl?.path).toContain('.trae/.ignore')

    const source = ignoreDecl?.source as {kind: string, content: string}
    expect(source?.content).toBe('node_modules\ndist')
  })
})
