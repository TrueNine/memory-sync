import process from 'node:process'

export const siteConfig = {
  productName: 'memory-sync',
  shortName: 'memory-sync Docs',
  title: 'memory-sync 文档',
  description:
    '为多 AI 工具同步规则、技能、命令与记忆的 Rust-first / NAPI-first 文档站。',
  repoUrl: 'https://github.com/TrueNine/memory-sync',
  docsRepositoryBase: 'https://github.com/TrueNine/memory-sync/blob/main/doc',
  issueUrl: 'https://github.com/TrueNine/memory-sync/issues/new/choose'
} as const

export function getSiteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_DOCS_SITE_URL ?? 'http://localhost:3000')
}

export const homeSections = [
  {
    title: '一次编写，多端啃穿',
    body:
      '把 Global Prompt、Workspace Prompt、Skills、Commands、Sub-agents 与 Rules 统一写成 MDX 源，再把它们同步进 Cursor、Claude Code、Codex、Gemini、Warp、JetBrains 与更多目标。'
  },
  {
    title: 'Rust-first，不再堆纯 TypeScript 补丁',
    body:
      'CLI、Rust crate 与 TypeScript 接口同时存在，但核心能力默认沉到 Rust 与 NAPI，不再把历史兼容层继续包装成长期架构。'
  },
  {
    title: '不是“官方入口”，而是资源拾荒器',
    body:
      'memory-sync 接受现实世界没有统一标准，把你已有的提示词、规则文件、配置入口全都变成可编排、可清理、可审计的可迁移资产。'
  }
] as const

export const capabilityCards = [
  {
    label: 'Prompt Source',
    title: 'MDX 作为单一真源',
    detail: '用 `.src.mdx` 与 MDX 前置元数据描述技能、命令、子代理与规则，再由输出插件生成各工具原生格式。'
  },
  {
    label: 'Pipeline',
    title: '输出插件全量声明写入',
    detail: '插件声明目标文件与清理路径，核心运行时统一执行写入、干跑和清理。'
  },
  {
    label: 'Protection',
    title: '可审计清理保护',
    detail: '`cleanupProtection` 与 `outputScopes` 让你在全局/项目两层精确控制输出范围和删除边界。'
  },
  {
    label: 'Reality Check',
    title: '文档只写仓库真相',
    detail: '这里的内容来自 README、CLI 帮助、JSON Schema 与实际实现，不沿用旧叙事，也不虚构自动化能力。'
  }
] as const

export const manifestoPoints = [
  '巨头不提供统一规范，memory-sync 就把每个可写入口都变成可利用的落点。',
  '迁移不是“导出一份备份”而已，而是把个人工作记忆从单一工具中剥离出来。',
  '同步必须是可计算、可清理、可回滚边界明确的，不给隐性残留和历史垃圾继续扩张。'
] as const
