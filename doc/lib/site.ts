import process from 'node:process'

export const siteConfig = {
  productName: 'memory-sync',
  shortName: 'memory-sync Docs',
  title: 'memory-sync 文档',
  description:
    '面向多 AI 工具的 prompt、rule、skill、command 与 project memory sync 文档站。',
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
    href: '/docs/quick-guide',
    title: '快速指引',
    detail: '先用一页判断你应该从 CLI、GUI 还是 MCP 进入，再跳到最短可执行路径。'
  },
  {
    href: '/docs/cli',
    title: 'CLI',
    detail: '围绕安装、项目准备、第一次同步、配置字段与命令表面组织。'
  },
  {
    href: '/docs/sdk',
    title: 'SDK',
    detail: '单独说明 private mixed core 的职责边界、消费方向，以及它与 tnmsc crate / cli shell 的关系。'
  },
  {
    href: '/docs/mcp',
    title: 'MCP',
    detail: '独立查看 stdio server、工具列表、workspaceDir 约束与适用边界。'
  },
  {
    href: '/docs/gui',
    title: 'GUI',
    detail: '单独查看桌面层的职责、页面结构，以及它与 sdk / tnmsc crate / CLI 的关系。'
  },
  {
    href: '/docs/technical-details',
    title: '技术细节',
    detail: '集中阅读架构边界、同步管线、真源模型与内容编写约定。'
  },
  {
    href: '/docs/design-rationale',
    title: '设计初衷',
    detail: '把项目动机、设计理由与 manifesto 类内容单独收口，不再混入使用文档。'
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
    href: '/docs/quick-guide',
    title: '选择入口',
    description: '先判断你当前是终端同步、桌面工作流还是 MCP 集成。'
  },
  {
    step: '02',
    href: '/docs/cli/install',
    title: '确认运行前提',
    description: '先核对 Node、Rust、CLI 入口与当前支持边界。'
  },
  {
    step: '03',
    href: '/docs/cli/workspace-setup',
    title: '准备项目结构',
    description: '按照 aindex 与项目配置的真实目录约定组织源文件。'
  },
  {
    step: '04',
    href: '/docs/technical-details/source-of-truth',
    title: '开始维护源内容',
    description: '先建立真源模型，再区分全局 Prompt、项目 Prompt 与其他输入资产。'
  },
  {
    step: '05',
    href: '/docs/cli/cli-commands',
    title: '执行 dry-run 与同步',
    description: '在写入目标工具前先验证输出列表、范围与清理行为。'
  }
] as const
