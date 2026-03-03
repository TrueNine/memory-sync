/**
 * 路径解析器 - 在 Config 加载后初始化
 *
 * 提供类型安全的路径访问，所有路径都在构造时解析为绝对路径
 */

import type {TnmscConfig} from '../types'
import type {
  AindexConfigPath,
  AindexPath,
  KnowledgePath,
  ProjectPath,
  WorkspacePath
} from './types'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createAindexConfigPath,
  createAindexPath,
  createKnowledgePath,
  createProjectPath,
  createWorkspacePath
} from './factories'

export class PathResolver {
  private readonly workspaceDir: string
  private readonly aindexDirName: string

  constructor(config: TnmscConfig) {
    this.workspaceDir = this.expandHomeDir(config.workspaceDir)
    this.aindexDirName = config.aindex.dir
  }

  private expandHomeDir(inputPath: string): string {
    if (!inputPath.startsWith('~')) return path.resolve(inputPath)
    return path.join(os.homedir(), inputPath.slice(2))
  }

  /** 获取 workspace 根目录 */
  get workspace(): WorkspacePath {
    return createWorkspacePath(this.workspaceDir, '')
  }

  /** 获取 aindex 配置文件的固定路径 ~/.aindex/.tnmsc.json */
  get aindexConfig(): AindexConfigPath {
    return createAindexConfigPath()
  }

  /** 获取 aindex 内容目录 {workspace}/{aindexDirName} */
  get aindex(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, '', '')
  }

  /** 获取 knowledge 目录 {workspace}/knowledge */
  get knowledge(): KnowledgePath {
    return createKnowledgePath(this.workspaceDir, '')
  }

  /** 获取 skills 模块路径 */
  get skills(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'skills')
  }

  /** 获取 commands 模块路径 */
  get commands(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'commands')
  }

  /** 获取 subAgents 模块路径 */
  get subAgents(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'subAgents')
  }

  /** 获取 rules 模块路径 */
  get rules(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'rules')
  }

  /** 获取 globalPrompt 模块路径 */
  get globalPrompt(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'globalPrompt')
  }

  /** 获取 workspacePrompt 模块路径 */
  get workspacePrompt(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'workspacePrompt')
  }

  /** 获取 app 模块路径 */
  get app(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'app')
  }

  /** 获取 ext 模块路径 */
  get ext(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'ext')
  }

  /** 获取 arch 模块路径 */
  get arch(): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, 'arch')
  }

  moduleSrc(moduleName: string): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, path.join(moduleName, 'src'))
  }

  moduleDist(moduleName: string): AindexPath {
    return createAindexPath(this.workspaceDir, this.aindexDirName, path.join(moduleName, 'dist'))
  }

  project(projectName: string): ProjectPath {
    return createProjectPath(this.workspaceDir, projectName)
  }

  workspacePath(relativePath: string): WorkspacePath {
    return createWorkspacePath(this.workspaceDir, relativePath)
  }

  aindexPath(moduleName: string, relativePath?: string): AindexPath {
    const modulePath = relativePath !== void 0 && relativePath !== '' ? path.join(moduleName, relativePath) : moduleName
    return createAindexPath(this.workspaceDir, this.aindexDirName, modulePath)
  }

  knowledgePath(relativePath: string): KnowledgePath {
    return createKnowledgePath(this.workspaceDir, relativePath)
  }
}
