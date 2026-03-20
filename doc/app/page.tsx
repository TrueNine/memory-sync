import Link from 'next/link'
import {capabilityCards, homeSections, manifestoPoints, siteConfig} from '../lib/site'

const quickLinks = [
  {
    href: '/docs/quick-start',
    label: '快速上手',
    description: '从安装、目录准备到第一次同步的最短路径。'
  },
  {
    href: '/docs/concepts',
    label: '概念与世界观',
    description: '理解 Rust-first、真源模型与多工具输出边界。'
  },
  {
    href: '/docs/authoring',
    label: '内容编写',
    description: '集中查看 prompts、skills、commands、sub-agents 与 rules 的写法。'
  },
  {
    href: '/docs/reference',
    label: '参考手册',
    description: '直接跳到 CLI、Schema、plugin config 与输出约束。'
  }
] as const

const readingPath = [
  {
    step: '01',
    href: '/docs/quick-start/install',
    title: '安装与环境确认',
    description: '先确认 Node、Rust 与 CLI 入口都在真实支持范围内。'
  },
  {
    step: '02',
    href: '/docs/quick-start/workspace-setup',
    title: '准备工作区结构',
    description: '按当前仓库约定放置内容源，而不是沿用旧初始化习惯。'
  },
  {
    step: '03',
    href: '/docs/authoring/global-and-workspace-prompts',
    title: '开始编写源内容',
    description: '用 MDX 定义全局与项目级规则，保持单一真源。'
  },
  {
    step: '04',
    href: '/docs/reference/cli-commands',
    title: '校验与执行同步',
    description: '用 dry-run、clean 和命令参考把输出边界跑通。'
  }
] as const

export default function HomePage() {
  return (
    <main className="docs-home">
      <header className="home-topbar">
        <Link href="/" className="home-brand">
          <strong>{siteConfig.productName}</strong>
          <span>Docs</span>
        </Link>

        <nav className="home-topbar-nav" aria-label="Primary">
          <Link href="/docs">文档</Link>
          <a href={siteConfig.repoUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="section-kicker">Documentation</p>
          <h1>围绕真实仓库与真实命令维护的一套 memory-sync 文档。</h1>
          <p className="home-hero-lead">
            {siteConfig.productName}
            把 prompts、rules、skills、commands、sub-agents 和 workspace memory 汇成同一套可迁移资产。这里不再尝试做一张强调风格的首页，而是把真实仓库结构、概念边界与执行入口收进同一套更安静的 docs 系统。
          </p>

          <div className="home-actions">
            <Link href="/docs" className="hero-button hero-button-primary">
              打开文档
            </Link>
            <a href={siteConfig.repoUrl} target="_blank" rel="noreferrer" className="hero-button hero-button-secondary">
              查看 GitHub
            </a>
          </div>

          <div className="home-summary-grid">
            {homeSections.map(section => (
              <article key={section.title} className="home-summary-card">
                <h2>{section.title}</h2>
                <p>{section.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <p className="section-kicker">Start Here</p>
          <h2>从这些入口进入，比先读一整篇宣言更有效</h2>
        </div>

        <div className="home-link-grid">
          {quickLinks.map(link => (
            <Link key={link.href} href={link.href} className="home-link-card">
              <strong>{link.label}</strong>
              <p>{link.description}</p>
              <span>Open</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <p className="section-kicker">Capabilities</p>
          <h2>文档重点覆盖的能力边界</h2>
        </div>

        <div className="capability-grid">
          {capabilityCards.map(card => (
            <article key={card.title} className="capability-card">
              <span>{card.label}</span>
              <h3>{card.title}</h3>
              <p>{card.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <p className="section-kicker">Recommended Path</p>
          <h2>一条更像官方文档站的阅读路线</h2>
        </div>

        <div className="reading-path-grid">
          {readingPath.map(item => (
            <Link key={item.href} href={item.href} className="reading-path-card">
              <small>{item.step}</small>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <p className="section-kicker">Why It Exists</p>
          <h2>仍然保留这套项目的锋芒，但把它放进更易读的版式里</h2>
        </div>

        <div className="manifesto-points-grid">
          {manifestoPoints.map(point => (
            <article key={point} className="manifesto-point-card">
              <p>{point}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
