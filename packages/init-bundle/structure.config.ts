/**
 * 项目结构配置 - 单一数据源
 *
 * 设计原则：
 * 1. 只声明相对于 public 的路径列表
 * 2. key = path，无需重复定义
 * 3. 通过 as const 提供强类型推导
 */

/** 运行时 Bundle 项：包含路径和内容 */
export interface RuntimeBundleItem {
  readonly path: string // 相对于 public 的路径（= key）
  readonly content: string // 文件内容
}

/**
 * Bundle 路径列表
 * 每个路径相对于 public，同时也是 bundles 的 key
 */
export const bundlePaths = [
  // 全局记忆模板
  'app/global.cn.mdx',

  // IDE 配置 - JetBrains
  '.idea/.gitignore',
  '.idea/codeStyles/Project.xml',
  '.idea/codeStyles/codeStyleConfig.xml',

  // IDE 配置 - VSCode
  '.vscode/settings.json',
  '.vscode/extensions.json',

  // 通用配置
  '.editorconfig',
  '.gitignore',

  // 独立文件
  'public/tnmsc.example.json',
  'public/exclude',
  'public/gitignore',
  'public/kiro_global_powers_registry.json',

  // Prompt 指南
  'src/skills/prompt-builder/global-memory-prompt.cn.mdx',
  'src/skills/prompt-builder/root-memory-prompt.cn.mdx',
  'src/skills/prompt-builder/child-memory-prompt.cn.mdx'
] as const

/** 从路径列表推断 bundle key 类型 */
export type BundleKey = (typeof bundlePaths)[number]

/** 运行时 Bundles 类型：强类型的 key-value 映射 */
export type RuntimeBundles = {
  readonly [K in BundleKey]: RuntimeBundleItem
}

// 导出配置的 AINDEX 基础路径（用于构建工具）
export const PUBLIC_BASE = './public'
