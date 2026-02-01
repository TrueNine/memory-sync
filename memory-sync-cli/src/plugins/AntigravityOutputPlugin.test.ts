import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import {describe, expect, it, vi} from 'vitest'
import {FilePathKind} from '@/types'
import {AntigravityOutputPlugin} from './AntigravityOutputPlugin'

vi.mock('node:fs')
vi.mock('node:os')

describe('antigravityOutputPlugin', () => {
  const plugin = new AntigravityOutputPlugin()
  const projectBasePath = '/user/project'
  const projectPath = 'my-project'
  const homeDir = '/home/user'

  vi.mocked(os.homedir).mockReturnValue(homeDir)

  const projectDir: RelativePath = {
    pathKind: FilePathKind.Relative,
    path: projectPath,
    basePath: projectBasePath,
    getDirectoryName: () => 'my-project',
    getAbsolutePath: () => `${projectBasePath}/${projectPath}`
  }

  const mockSkills: any[] = [
    {
      dir: {
        pathKind: FilePathKind.Relative,
        path: 'my-skill',
        basePath: projectBasePath,
        getDirectoryName: () => 'my-skill',
        getAbsolutePath: () => `${projectBasePath}/my-skill`
      },
      content: '# My Skill',
      yamlFrontMatter: {name: 'custom-skill'},
      resources: [
        {relativePath: 'res.txt', content: 'resource content'}
      ],
      childDocs: [
        {
          dir: {
            pathKind: FilePathKind.Relative,
            path: 'doc.mdx',
            basePath: projectBasePath,
            getDirectoryName: () => 'doc',
            getAbsolutePath: () => `${projectBasePath}/doc.mdx`
          },
          content: 'doc content'
        }
      ]
    }
  ]

  const mockFastCommands: any[] = [
    {
      commandName: 'cmd1',
      series: 'custom',
      dir: {
        pathKind: FilePathKind.Relative,
        path: 'cmd1.md',
        basePath: projectBasePath,
        getDirectoryName: () => 'cmd1',
        getAbsolutePath: () => `${projectBasePath}/cmd1.md`
      },
      content: '# Command 1',
      yamlFrontMatter: {description: 'A description', other: 'ignore'}
    },
    {
      commandName: 'cmd2',
      series: 'custom',
      dir: {
        pathKind: FilePathKind.Relative,
        path: 'cmd2.md',
        basePath: projectBasePath,
        getDirectoryName: () => 'cmd2',
        getAbsolutePath: () => `${projectBasePath}/cmd2.md`
      },
      content: '# Command 2',
      rawMdxContent: '---\ntitle: original\n---\n# Command 2 Raw',
      yamlFrontMatter: {description: 'Desc 2'}
    }
  ]

  const mockInputContext: any = {
    globalMemory: null,
    workspace: {
      projects: [
        {
          name: 'p1',
          dirFromWorkspacePath: projectDir,
          rootMemoryPrompt: null
        }
      ]
    },
    skills: mockSkills,
    fastCommands: mockFastCommands
  }

  const mockContext: any = {
    collectedInputContext: mockInputContext,
    tools: {
      readProjectFile: vi.fn()
    },
    config: {
      plugins: []
    },
    dryRun: false
  }

  it('should register output directories for clean (project local)', async () => {
    const ctx = {
      collectedInputContext: {
        workspace: {
          projects: [
            {
              dirFromWorkspacePath: projectDir
            }
          ]
        }
      }
    } as any

    const results = await plugin.registerProjectOutputDirs(ctx)
    expect(results).toHaveLength(2) // Should still register local project directories for cleanup
    const paths = results.map(r => r.path.replaceAll('\\', '/'))
    expect(paths.some(p => p.includes('.agent/skills'))).toBe(true)
    expect(paths.some(p => p.includes('.agent/workflows'))).toBe(true)
  })

  it('should register output files for skills (global)', async () => {
    const ctx = {
      collectedInputContext: {
        workspace: {
          projects: [] // even with no projects, global files should be registered if skills exist
        },
        skills: mockSkills
      }
    } as any

    const results = await plugin.registerProjectOutputFiles(ctx)
    expect(results).toHaveLength(3)
    const paths = new Set(results.map(r => r.path.replaceAll('\\', '/')))
    expect(paths.has('SKILL.md')).toBe(true) // r.path is now the relative filename
    expect(paths.has('doc.md')).toBe(true)
    expect(paths.has('res.txt')).toBe(true)

    const globalPathPart = '.gemini/antigravity/skills' // Check if base paths are global
    const basePaths = results.map(r => r.basePath.replaceAll('\\', '/'))
    expect(basePaths.every(p => p.includes(globalPathPart))).toBe(true)
  })

  it('should write skills correctly to global dir', async () => {
    await plugin.writeProjectOutputs(mockContext)

    const expectedSkillPath = '.gemini/antigravity/skills/custom-skill/SKILL.md' // Global path: /home/user/.gemini/antigravity/skills/custom-skill/SKILL.md // Check for global path write

    const skillCall = vi.mocked(fs.writeFileSync).mock.calls.find(call =>
      String(call[0]).replaceAll('\\', '/').includes(expectedSkillPath))

    expect(skillCall).toBeDefined()
    expect(skillCall![1]).toContain('# My Skill')

    const resCall = vi.mocked(fs.writeFileSync).mock.calls.find(call =>
      String(call[0]).replaceAll('\\', '/').includes('.gemini/antigravity/skills/custom-skill/res.txt'))
    expect(resCall).toBeDefined()
    expect(resCall![1]).toBe('resource content')

    const docCall = vi.mocked(fs.writeFileSync).mock.calls.find(call =>
      String(call[0]).replaceAll('\\', '/').includes('.gemini/antigravity/skills/custom-skill/doc.md'))
    expect(docCall).toBeDefined()
    expect(docCall![1]).toBe('doc content')
  })

  it('should write workflows (fast commands) correctly to global dir', async () => {
    await plugin.writeProjectOutputs(mockContext)

    const expectedWorkflowPath = '.gemini/antigravity/workflows' // Expected: /home/user/.gemini/antigravity/workflows/custom_cmd1.md

    const cmd1Call = vi.mocked(fs.writeFileSync).mock.calls.find(call => {
      const normalizedPath = String(call[0]).replaceAll('\\', '/')
      return normalizedPath.includes(expectedWorkflowPath) && normalizedPath.includes('custom_cmd1.md')
    })
    expect(cmd1Call).toBeDefined()
    const cmd1Content = cmd1Call![1] as string
    expect(cmd1Content).toContain('description: A description')

    const cmd2Call = vi.mocked(fs.writeFileSync).mock.calls.find(call => {
      const normalizedPath = String(call[0]).replaceAll('\\', '/')
      return normalizedPath.includes(expectedWorkflowPath) && normalizedPath.includes('custom_cmd2.md')
    })
    expect(cmd2Call).toBeDefined()
    const cmd2Content = cmd2Call![1] as string
    expect(cmd2Content).toContain('# Command 2 Raw')
  })

  it('should not write files in dry run mode', async () => {
    const dryRunContext = {...mockContext, dryRun: true}
    vi.mocked(fs.writeFileSync).mockClear()

    const results = await plugin.writeProjectOutputs(dryRunContext)

    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(results.files.length).toBeGreaterThan(0)
    expect(results.files.every(f => f.success)).toBe(true)
  })

  describe('mcp config merging', () => {
    const skillWithMcp: any = {
      dir: {
        pathKind: FilePathKind.Relative,
        path: 'mcp-skill',
        basePath: projectBasePath,
        getDirectoryName: () => 'mcp-skill',
        getAbsolutePath: () => `${projectBasePath}/mcp-skill`
      },
      content: '# MCP Skill',
      yamlFrontMatter: {name: 'mcp-skill'},
      mcpConfig: {
        type: 'SkillMcpConfig',
        mcpServers: {
          context7: {command: 'npx', args: ['-y', '@upstash/context7-mcp']},
          deepwiki: {url: 'https://mcp.deepwiki.com/mcp'}
        },
        rawContent: '{"mcpServers":{}}'
      }
    }

    const skillWithoutMcp: any = {
      dir: {
        pathKind: FilePathKind.Relative,
        path: 'normal-skill',
        basePath: projectBasePath,
        getDirectoryName: () => 'normal-skill',
        getAbsolutePath: () => `${projectBasePath}/normal-skill`
      },
      content: '# Normal Skill',
      yamlFrontMatter: {name: 'normal-skill'}
    }

    it('should register mcp_config.json when any skill has MCP config', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: []},
          skills: [skillWithMcp]
        }
      } as any

      const results = await plugin.registerProjectOutputFiles(ctx)
      const mcpFile = results.find(r => r.path === 'mcp_config.json')

      expect(mcpFile).toBeDefined()
      expect(mcpFile!.basePath.replaceAll('\\', '/')).toContain('.gemini/antigravity')
    })

    it('should NOT register mcp_config.json when no skill has MCP config', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: []},
          skills: [skillWithoutMcp]
        }
      } as any

      const results = await plugin.registerProjectOutputFiles(ctx)
      const mcpFile = results.find(r => r.path === 'mcp_config.json')

      expect(mcpFile).toBeUndefined()
    })

    it('should write merged MCP config with namespaced keys', async () => {
      vi.mocked(fs.writeFileSync).mockClear()

      const ctx = {
        collectedInputContext: {
          globalMemory: null,
          workspace: {projects: []},
          skills: [skillWithMcp],
          fastCommands: null
        },
        config: {plugins: []},
        dryRun: false
      } as any

      await plugin.writeProjectOutputs(ctx)

      const mcpCall = vi.mocked(fs.writeFileSync).mock.calls.find(call =>
        String(call[0]).replaceAll('\\', '/').includes('mcp_config.json'))

      expect(mcpCall).toBeDefined()
      const content = JSON.parse(mcpCall![1] as string)
      expect(content.mcpServers).toBeDefined()
      expect(content.mcpServers.context7).toBeDefined()
      expect(content.mcpServers.deepwiki).toBeDefined()
    })

    it('should skip writing mcp_config.json when no skill has MCP config', async () => {
      vi.mocked(fs.writeFileSync).mockClear()

      const ctx = {
        collectedInputContext: {
          globalMemory: null,
          workspace: {projects: []},
          skills: [skillWithoutMcp],
          fastCommands: null
        },
        config: {plugins: []},
        dryRun: false
      } as any

      await plugin.writeProjectOutputs(ctx)

      const mcpCall = vi.mocked(fs.writeFileSync).mock.calls.find(call =>
        String(call[0]).replaceAll('\\', '/').includes('mcp_config.json'))

      expect(mcpCall).toBeUndefined()
    })

    it('should not write mcp_config.json in dry-run mode', async () => {
      vi.mocked(fs.writeFileSync).mockClear()

      const ctx = {
        collectedInputContext: {
          globalMemory: null,
          workspace: {projects: []},
          skills: [skillWithMcp],
          fastCommands: null
        },
        config: {plugins: []},
        dryRun: true
      } as any

      const results = await plugin.writeProjectOutputs(ctx)

      expect(fs.writeFileSync).not.toHaveBeenCalled()
      const mcpResult = results.files.find(f => f.path.path === 'mcp_config.json')
      expect(mcpResult).toBeDefined()
      expect(mcpResult!.success).toBe(true)
    })
  })
})
