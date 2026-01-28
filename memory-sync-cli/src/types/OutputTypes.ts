import type {GlobalConfigDirectoryType} from 'memory-sync-cli/src/types/Enums' // TODO Add output target deletion // TODO Add output source collection
import type {AbsolutePath, RelativePath} from 'memory-sync-cli/src/types/FileSystemTypes'

/**
 * Global configuration based on user_home root directory
 */
export interface GlobalConfigDirectoryInUserHome<K = GlobalConfigDirectoryType.UserHome> {
  readonly type: K
  readonly directory: RelativePath
}

/**
 * Special, absolute path global memory prompt
 */
export interface GlobalConfigDirectoryInOther<K = GlobalConfigDirectoryType.External> {
  readonly type: K
  readonly directory: AbsolutePath
}

export type GlobalConfigDirectory<K = GlobalConfigDirectoryType> = GlobalConfigDirectoryInUserHome<K> | GlobalConfigDirectoryInOther<K>

export interface Target {

}
