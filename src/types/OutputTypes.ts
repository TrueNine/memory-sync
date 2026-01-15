import type {GlobalConfigDirectoryType} from '@/types/Enums' // TODO 加入输出 target 的删除 // TODO 加入输出源的收集
import type {AbsolutePath, RelativePath} from '@/types/FileSystemTypes'

/**
 * 基于 user_home 根目录的全局配置
 */
export interface GlobalConfigDirectoryInUserHome<K = GlobalConfigDirectoryType.UserHome> {
  readonly type: K
  readonly directory: RelativePath
}

/**
 * 特殊的，绝对路径的全局记忆提示词
 */
export interface GlobalConfigDirectoryInOther<K = GlobalConfigDirectoryType.External> {
  readonly type: K
  readonly directory: AbsolutePath
}

export type GlobalConfigDirectory<K = GlobalConfigDirectoryType> = GlobalConfigDirectoryInUserHome<K> | GlobalConfigDirectoryInOther<K>

export interface Target {

}
