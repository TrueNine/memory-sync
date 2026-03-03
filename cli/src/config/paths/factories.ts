/**
 * 路径工厂函数 - 创建类型安全的路径对象
 *
 * 所有路径对象都通过工厂函数创建，确保路径正确解析为绝对路径
 */

import type {
  AindexConfigPath,
  AindexPath,
  HomedirPath,
  KnowledgePath,
  ProjectPath,
  WorkspacePath,
  XdgConfigPath
} from './types'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'

const homeDir = os.homedir()
const xdgConfigDir = process.env['XDG_CONFIG_HOME'] ?? path.join(homeDir, '.config')

/**
 * 展开 ~ 为用户主目录
 */
function expandHomeDir(inputPath: string): string {
  if (!inputPath.startsWith('~')) return path.resolve(inputPath)
  return path.join(homeDir, inputPath.slice(2))
}

/**
 * 创建 HomedirPath - 基于 ~/ 的路径
 * @param relativeToHome - 相对于 home 的路径，如 '.aindex'
 */
export function createHomedirPath(relativeToHome: string): HomedirPath {
  return {
    _brand: 'HomedirPath',
    absolute: path.join(homeDir, relativeToHome),
    relativeToHome
  }
}

/**
 * 创建 XdgConfigPath - 基于 ~/.config/ 的路径
 * @param relativeToXdgConfig - 相对于 ~/.config 的路径
 */
export function createXdgConfigPath(relativeToXdgConfig: string): XdgConfigPath {
  return {
    _brand: 'XdgConfigPath',
    absolute: path.join(xdgConfigDir, relativeToXdgConfig),
    relativeToXdgConfig
  }
}

/**
 * 创建 WorkspacePath - 基于 workspaceDir 的路径
 * @param workspaceDir - 已解析的绝对 workspace 路径
 * @param relativeToWorkspace - 相对于 workspace 的路径
 */
export function createWorkspacePath(
  workspaceDir: string,
  relativeToWorkspace: string
): WorkspacePath {
  const expanded = expandHomeDir(workspaceDir)
  return {
    _brand: 'WorkspacePath',
    absolute: path.join(expanded, relativeToWorkspace),
    relativeToWorkspace
  }
}

/**
 * 创建 ProjectPath - 基于项目的路径
 * @param workspaceDir - 已解析的绝对 workspace 路径
 * @param projectName - 项目名称
 * @param relativeToProject - 相对于项目根目录的路径
 */
export function createProjectPath(
  workspaceDir: string,
  projectName: string,
  relativeToProject: string = ''
): ProjectPath {
  const expanded = expandHomeDir(workspaceDir)
  const projectRoot = path.join(expanded, projectName)
  return {
    _brand: 'ProjectPath',
    absolute: path.join(projectRoot, relativeToProject),
    projectName,
    relativeToProject
  }
}

/**
 * 创建 AindexConfigPath - 固定的配置文件路径 ~/.aindex/.tnmsc.json
 */
export function createAindexConfigPath(): AindexConfigPath {
  return {
    _brand: 'AindexConfigPath',
    absolute: path.join(homeDir, '.aindex', '.tnmsc.json'),
    configFileName: '.tnmsc.json'
  }
}

/**
 * 创建 AindexPath - 基于 {workspace}/{aindexDirName} 的路径
 * @param workspaceDir - 已解析的 workspace 路径
 * @param aindexDirName - aindex 目录名 (默认 'aindex')
 * @param module - 模块名称 (skills/commands/subAgents 等)
 * @param relativeToModule - 相对于模块目录的路径
 */
export function createAindexPath(
  workspaceDir: string,
  aindexDirName: string,
  module: string,
  relativeToModule: string = ''
): AindexPath {
  const expanded = expandHomeDir(workspaceDir)
  const aindexDir = path.join(expanded, aindexDirName)
  return {
    _brand: 'AindexPath',
    absolute: path.join(aindexDir, module, relativeToModule),
    relativeToAindex: path.join(module, relativeToModule),
    module
  }
}

/**
 * 创建 KnowledgePath - 基于 {workspace}/knowledge 的路径
 * @param workspaceDir - 已解析的 workspace 路径
 * @param relativeToKnowledge - 相对于 knowledge 根目录的路径
 */
export function createKnowledgePath(
  workspaceDir: string,
  relativeToKnowledge: string = ''
): KnowledgePath {
  const expanded = expandHomeDir(workspaceDir)
  const knowledgeDir = path.join(expanded, 'knowledge')
  return {
    _brand: 'KnowledgePath',
    absolute: path.join(knowledgeDir, relativeToKnowledge),
    relativeToKnowledge
  }
}
