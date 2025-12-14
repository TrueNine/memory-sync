import type { PluginKind } from '@/core/Enums'
import type { CollectedInputContext } from '@/core/InputTypes'

export interface Plugin<T extends PluginKind = PluginKind> {
  readonly type: T
  /**
   * 插件名称（亦是插件id）
   */
  readonly name: string
}

export interface OutputPlugin extends Plugin<PluginKind.Output> {
}

export interface InputPluginContext extends CollectedInputContext {
  resolvePlaceholderPath: (path: string) => string
}

export interface InputPlugin extends Plugin<PluginKind.Input> {
}
