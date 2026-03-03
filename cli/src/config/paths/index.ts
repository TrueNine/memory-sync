/**
 * 路径类型系统统一导出
 */

export { // 工厂函数
  createAindexConfigPath,
  createAindexPath,
  createHomedirPath,
  createKnowledgePath,
  createProjectPath,
  createWorkspacePath,
  createXdgConfigPath
} from './factories'

export {
  PathResolver
} from './PathResolver' // 路径解析器

export type { // 类型定义
  AindexConfigPath,
  AindexPath,
  AnyPath,
  HomedirPath,
  KnowledgePath,
  ProjectPath,
  TypedPath,
  WorkspacePath,
  XdgConfigPath
} from './types'
