/**
 * Init Bundle - 项目初始化包
 *
 * 导出强类型的 bundles 对象
 * key = path（相对于 aindex 的路径）
 */

import type {BundleKey, RuntimeBundleItem, RuntimeBundles} from '../structure.config'
import {bundlePaths} from '../structure.config'

declare const INJECTED: Readonly<Record<string, string>> // 构建时注入的 content 映射

let _injected: Readonly<Record<string, string>> = INJECTED // eslint-disable-line prefer-const -- 缓存注入常量

/**
 * 强类型的 Bundles 对象
 * key: 相对于 aindex 的路径（如 'app/global.cn.mdx'）
 * value: { path, content }
 */
export const bundles: RuntimeBundles = Object.fromEntries(
  bundlePaths.map(path => [
    path,
    {path, content: _injected[path] ?? ''} satisfies RuntimeBundleItem
  ])
) as RuntimeBundles

/** 重新导出类型 */
export type {
  BundleKey,
  RuntimeBundleItem,
  RuntimeBundles
} from '../structure.config'
