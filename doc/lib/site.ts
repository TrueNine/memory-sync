import process from 'node:process'

export const siteConfig = {
  productName: 'memory-sync',
  shortName: 'memory-sync Docs',
  title: 'memory-sync 文档',
  description:
    '面向多 AI 工具的 prompt、rule、skill、command 与 workspace memory sync 文档站。',
  repoUrl: 'https://github.com/TrueNine/memory-sync',
  docsRepositoryBase: 'https://github.com/TrueNine/memory-sync/blob/main/doc',
  issueUrl: 'https://github.com/TrueNine/memory-sync/issues/new/choose'
} as const

export function getSiteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_DOCS_SITE_URL ?? 'http://localhost:3000')
}

export const heroProofPoints = [
  {
    label: 'Architecture',
    value: 'Rust-first / NAPI-first'
  },
  {
    label: 'Source Model',
    value: 'MDX as source of truth'
  },
  {
    label: 'Output',
    value: 'Native config materialization'
  }
] as const

export const homeEntryCards = [
  {
    href: '/docs/quick-start',
    title: '快速上手',
    detail: '按最短路径完成安装、工作区准备与第一次同步。'
  },
  {
    href: '/docs/concepts/architecture',
    title: '架构边界',
    detail: '先理解 CLI、crate、NAPI 与 GUI 的职责分层。'
  },
  {
    href: '/docs/authoring',
    title: '内容编写',
    detail: '集中查看 prompts、skills、commands、sub-agents 与 rules 的源文件职责。'
  },
  {
    href: '/docs/reference',
    title: '参考手册',
    detail: '在配置、Schema、CLI 与输出边界之间快速定位事实。'
  }
] as const

export const capabilityCards = [
  {
    label: 'Prompt Source',
    title: '统一维护输入资产',
    detail:
      '用 `.src.mdx` 和结构化 front matter 维护 prompt、skill、command、sub-agent 与 rule。'
  },
  {
    label: 'Pipeline',
    title: '按目标工具生成原生输出',
    detail: '由插件声明写入目标、清理范围与生成策略，避免手工复制配置。'
  },
  {
    label: 'Protection',
    title: '显式控制删除边界',
    detail: '`cleanupProtection` 与 `outputScopes` 用于约束清理范围和风险边界。'
  },
  {
    label: 'Docs',
    title: '文档只记录仓库已存在能力',
    detail: '页面内容对齐当前实现、CLI 帮助、Schema 与工作流事实，不延续旧叙事。'
  }
] as const

export const readingPath = [
  {
    step: '01',
    href: '/docs/quick-start/install',
    title: '确认运行前提',
    description: '先核对 Node、Rust、CLI 入口与当前支持边界。'
  },
  {
    step: '02',
    href: '/docs/quick-start/workspace-setup',
    title: '准备工作区结构',
    description: '按照 aindex 与项目配置的真实目录约定组织源文件。'
  },
  {
    step: '03',
    href: '/docs/authoring/global-and-workspace-prompts',
    title: '开始维护源内容',
    description: '区分全局 Prompt、工作区 Prompt 与其他输入资产。'
  },
  {
    step: '04',
    href: '/docs/reference/cli-commands',
    title: '执行 dry-run 与同步',
    description: '在写入目标工具前先验证输出列表、范围与清理行为。'
  }
] as const
