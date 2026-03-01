/**
 * Unit tests for pathResolver
 */

import type {TnmscConfig} from './types'
import * as os from 'node:os'
import * as path from 'node:path'
import {beforeEach, describe, expect, it} from 'vitest'
import {
  clearPathCache,
  expandHomeDir,
  getAbsoluteDistPath,
  getAbsoluteSrcPath,
  getAbsoluteWorkspaceDir,
  getAindexModulePaths,
  getRelativePath,
  isAbsolutePath,
  joinPath,
  normalizePath,
  resolveAllAindexPaths,
  resolveModulePaths,
  resolveWorkspacePath
} from './pathResolver'

describe('pathResolver', () => {
  beforeEach(() => clearPathCache())

  describe('expandHomeDir', () => {
    it('should expand ~ to home directory', () => {
      const result = expandHomeDir('~/project')
      expect(result).toBe(path.join(os.homedir(), 'project'))
    })

    it('should handle ~ alone', () => {
      const result = expandHomeDir('~')
      expect(result).toBe(os.homedir())
    })

    it('should not modify paths without ~', () => {
      const absolutePath = '/some/absolute/path'
      const result = expandHomeDir(absolutePath)
      expect(result).toBe(absolutePath)
    })

    it('should handle Windows-style home paths', () => {
      const result = expandHomeDir('~\\project')
      expect(result).toBe(path.join(os.homedir(), 'project'))
    })

    it('should return path as-is for ~username syntax', () => {
      const result = expandHomeDir('~otheruser/project')
      expect(result).toBe('~otheruser/project')
    })
  })

  describe('resolveWorkspacePath', () => {
    it('should resolve relative paths', () => {
      const result = resolveWorkspacePath('/workspace', 'src/skills')
      expect(result).toBe(path.resolve('/workspace', 'src/skills'))
    })

    it('should expand home directory in workspace path', () => {
      const result = resolveWorkspacePath('~/project', 'src')
      expect(result).toBe(path.resolve(os.homedir(), 'project', 'src'))
    })

    it('should use cache on second call', () => {
      const workspaceDir = '/workspace'
      const relativePath = 'src/skills'

      const result1 = resolveWorkspacePath(workspaceDir, relativePath)
      const result2 = resolveWorkspacePath(workspaceDir, relativePath)

      expect(result1).toBe(result2)
    })

    it('should skip cache when useCache is false', () => {
      const workspaceDir = '/workspace'
      const relativePath = 'src/skills'

      const result1 = resolveWorkspacePath(workspaceDir, relativePath, false)
      const result2 = resolveWorkspacePath(workspaceDir, relativePath, false)

      expect(result1).toBe(result2)
    }) // Both should be computed (not from cache)
  })

  describe('getAbsoluteSrcPath', () => {
    it('should return absolute source path', () => {
      const config: TnmscConfig = {
        version: '2026.10218.12101',
        workspaceDir: '/workspace',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test',
          username: 'test',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      const result = getAbsoluteSrcPath(config, config.aindex.skills)
      expect(result).toBe(path.resolve('/workspace', 'skills'))
    })
  })

  describe('getAbsoluteDistPath', () => {
    it('should return absolute distribution path', () => {
      const config: TnmscConfig = {
        version: '2026.10218.12101',
        workspaceDir: '/workspace',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test',
          username: 'test',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      const result = getAbsoluteDistPath(config, config.aindex.skills)
      expect(result).toBe(path.resolve('/workspace', 'dist/skills'))
    })
  })

  describe('resolveModulePaths', () => {
    it('should return resolved paths for module', () => {
      const config: TnmscConfig = {
        version: '2026.10218.12101',
        workspaceDir: '/workspace',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test',
          username: 'test',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      const result = resolveModulePaths(config, config.aindex.skills)

      expect(result.absoluteSrc).toBe(path.resolve('/workspace', 'skills'))
      expect(result.absoluteDist).toBe(path.resolve('/workspace', 'dist/skills'))
      expect(result.relativeSrc).toBe('skills')
      expect(result.relativeDist).toBe('dist/skills')
    })
  })

  describe('getAbsoluteWorkspaceDir', () => {
    it('should expand home directory', () => {
      const result = getAbsoluteWorkspaceDir('~/project')
      expect(result).toBe(path.join(os.homedir(), 'project'))
    })

    it('should return absolute path as-is', () => {
      const result = getAbsoluteWorkspaceDir('/workspace')
      expect(result).toBe('/workspace')
    })
  })

  describe('getRelativePath', () => {
    it('should return relative path from workspace', () => {
      const result = getRelativePath('/workspace', '/workspace/src/skills')
      expect(result).toBe(path.normalize('src/skills'))
    })

    it('should expand home directory in workspace', () => {
      const result = getRelativePath('~/project', path.join(os.homedir(), 'project', 'src'))
      expect(result).toBe('src')
    })
  })

  describe('isAbsolutePath', () => {
    it('should return true for absolute paths', () => expect(isAbsolutePath('/absolute/path')).toBe(true))

    it('should return false for relative paths', () => expect(isAbsolutePath('relative/path')).toBe(false))

    it('should return false for paths starting with ~', () => expect(isAbsolutePath('~/path')).toBe(false))
  })

  describe('normalizePath', () => {
    it('should normalize path separators', () => {
      const result = normalizePath('path//to///file')
      expect(result).toBe(path.normalize('path//to///file'))
    })

    it('should resolve . and ..', () => {
      const result = normalizePath('/path/to/../file')
      expect(result).toBe(path.normalize('/path/to/../file'))
    })
  })

  describe('joinPath', () => {
    it('should join path segments', () => {
      const result = joinPath('path', 'to', 'file')
      expect(result).toBe(path.join('path', 'to', 'file'))
    })
  })

  describe('resolveAllAindexPaths', () => {
    it('should resolve all aindex module paths', () => {
      const config: TnmscConfig = {
        version: '2026.10218.12101',
        workspaceDir: '/workspace',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test',
          username: 'test',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      const result = resolveAllAindexPaths(config)

      expect(result.skills.absoluteSrc).toBe(path.resolve('/workspace', 'skills'))
      expect(result.commands.absoluteSrc).toBe(path.resolve('/workspace', 'commands'))
      expect(result.subAgents.absoluteSrc).toBe(path.resolve('/workspace', 'agents'))
      expect(result.rules.absoluteSrc).toBe(path.resolve('/workspace', 'rules'))
      expect(result.globalPrompt.absoluteSrc).toBe(path.resolve('/workspace', 'app/global.cn.mdx'))
      expect(result.workspacePrompt.absoluteSrc).toBe(path.resolve('/workspace', 'app/workspace.cn.mdx'))
      expect(result.app.absoluteSrc).toBe(path.resolve('/workspace', 'app'))
      expect(result.ext.absoluteSrc).toBe(path.resolve('/workspace', 'ext'))
      expect(result.arch.absoluteSrc).toBe(path.resolve('/workspace', 'arch'))
    })
  })

  describe('getAindexModulePaths', () => {
    it('should return resolved paths for valid module', () => {
      const config: TnmscConfig = {
        version: '2026.10218.12101',
        workspaceDir: '/workspace',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test',
          username: 'test',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      const result = getAindexModulePaths(config, 'skills')

      expect(result.absoluteSrc).toBe(path.resolve('/workspace', 'skills'))
      expect(result.absoluteDist).toBe(path.resolve('/workspace', 'dist/skills'))
    })

    it('should throw for invalid module name', () => {
      const config: TnmscConfig = {
        version: '2026.10218.12101',
        workspaceDir: '/workspace',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test',
          username: 'test',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      expect(() => getAindexModulePaths(config, 'invalidModule' as keyof TnmscConfig['aindex'] & string)) // Type assertion to test invalid module name
        .toThrow('Invalid aindex module')
    })
  })

  describe('clearPathCache', () => {
    it('should clear the path cache', () => {
      resolveWorkspacePath('/workspace', 'src/skills') // Populate cache

      clearPathCache() // Clear cache

      const result = resolveWorkspacePath('/workspace', 'src/skills') // Should not throw and should recompute path
      expect(result).toBe(path.resolve('/workspace', 'src/skills'))
    })
  })
})
