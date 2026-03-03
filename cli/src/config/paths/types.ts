/**
 * 路径类型定义 - 语义清晰的路径类型系统
 *
 * 所有路径类型都继承自 TypedPath，只包含 absolute 属性
 * 通过 _brand 属性进行类型区分，避免复杂的继承层次
 */

/**
 * 基础路径接口 - 极度简化
 */
export interface TypedPath {
  /** 绝对路径（已解析 ~ 和环境变量） */
  readonly absolute: string
}

export interface HomedirPath extends TypedPath {
  readonly _brand: 'HomedirPath'
  /** 相对于 home 的路径 (如 '.aindex') */
  readonly relativeToHome: string
}

export interface XdgConfigPath extends TypedPath {
  readonly _brand: 'XdgConfigPath'
  /** 相对于 ~/.config 的路径 */
  readonly relativeToXdgConfig: string
}

/**
 * Workspace 路径 - 用户配置的 workspaceDir 下的路径
 */
export interface WorkspacePath extends TypedPath {
  readonly _brand: 'WorkspacePath'
  /** 相对于 workspaceDir 的路径 */
  readonly relativeToWorkspace: string
}

/**
 * Project 路径 - 具体项目下的路径 (workspace 下的子目录)
 */
export interface ProjectPath extends TypedPath {
  readonly _brand: 'ProjectPath'
  /** 项目名称 */
  readonly projectName: string
  /** 相对于项目根目录的路径 */
  readonly relativeToProject: string
}

/**
 * Aindex 配置路径 - 固定位置 ~/.aindex/.tnmsc.json
 */
export interface AindexConfigPath extends TypedPath {
  readonly _brand: 'AindexConfigPath'
  /** 固定为 ~/.aindex/.tnmsc.json */
  readonly configFileName: '.tnmsc.json'
}

/**
 * Aindex 内容路径 - 固定在 {workspace}/aindex 下的路径
 */
export interface AindexPath extends TypedPath {
  readonly _brand: 'AindexPath'
  /** 相对于 aindex 目录的路径 */
  readonly relativeToAindex: string
  /** 所属模块 (skills/commands/subAgents 等) */
  readonly module: string
}

/**
 * Knowledge 路径 - 固定在 {workspace}/knowledge 下的路径
 */
export interface KnowledgePath extends TypedPath {
  readonly _brand: 'KnowledgePath'
  /** 相对于 knowledge 根目录的路径 */
  readonly relativeToKnowledge: string
}

/**
 * 路径联合类型
 */
export type AnyPath
  = | HomedirPath
    | XdgConfigPath
    | WorkspacePath
    | ProjectPath
    | AindexConfigPath
    | AindexPath
    | KnowledgePath
