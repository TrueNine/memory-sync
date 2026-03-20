import Link from 'next/link'
import {capabilityCards, homeSections, manifestoPoints, siteConfig} from '../lib/site'

const killChain = [
  '用 MDX 写下规则源',
  '由 CLI 收集全局与项目上下文',
  '按插件声明写入各工具原生配置',
  '用 `dry-run` 预览，再用 `clean` 清除旧残留'
] as const

const referenceLinks = [
  {href: '/docs/quick-start', label: '快速上手'},
  {href: '/docs/concepts/manifesto', label: '世界观与定位'},
  {href: '/docs/reference/cli-commands', label: 'CLI 命令参考'},
  {href: '/docs/reference/plugin-config', label: 'plugin.config.ts'}
] as const

export default function HomePage() {
  return (
    <main className="manifesto-shell">
      <section className="manifesto-hero">
        <div className="hero-topline">
          <span className="hero-kicker">Chinese-first Docs Platform</span>
          <span className="hero-kicker hero-kicker-muted">Rust-first / NAPI-first</span>
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="hero-eyebrow">FOR THE TOOL RATS</p>
            <h1 className="hero-title">
              把你已经咬到手的每一块 AI 规则碎片，
              <br />
              重新装配成能迁移、能同步、能清场的记忆系统。
            </h1>
            <p className="hero-lead">
              {siteConfig.productName}
              不等待任何平台施舍统一入口。它默认世界是碎片化的、接口是私有的、配置是各自为政的，于是它做一件事：
              把你现有的 prompts、rules、skills、commands、sub-agents 和 workspace memory 全部吃下来，转成可以在多工具之间流动的资产。
            </p>

            <div className="hero-actions">
              <Link href="/docs" className="hero-button hero-button-primary">
                进入文档
              </Link>
              <a href={siteConfig.repoUrl} target="_blank" rel="noreferrer" className="hero-button hero-button-secondary">
                查看 GitHub
              </a>
            </div>
          </div>

          <aside className="hero-rail">
            <div className="signal-card">
              <span className="signal-label">CURRENT POSTURE</span>
              <p>
                不再用一个个 IDE / CLI 做“记忆主库”。主库是你自己的 MDX 源，工具只是输出目标。
              </p>
            </div>
            <div className="signal-card signal-card-warning">
              <span className="signal-label">NO FAIRYTALE MODE</span>
              <p>
                文档不会假装自动部署、不会给过时命令续命、也不会把历史补丁包装成未来架构。
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="manifesto-strip">
        <div className="strip-grid">
          {homeSections.map(section => (
            <article key={section.title} className="strip-card">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="capability-zone">
        <div className="section-heading">
          <p className="section-kicker">What This Site Covers</p>
          <h2>不只是“介绍页面”，而是一份可执行的作战手册</h2>
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

      <section className="timeline-zone">
        <div className="section-heading">
          <p className="section-kicker">Typical Flow</p>
          <h2>一条正常同步链应该长这样</h2>
        </div>
        <ol className="kill-chain">
          {killChain.map(step =>
            <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="manifesto-grid-panel">
        <div className="section-heading">
          <p className="section-kicker">Manifesto</p>
          <h2>这不是“官方标准化方案”，而是对现实环境的反击</h2>
        </div>
        <div className="manifesto-points">
          {manifestoPoints.map(point =>
            <p key={point}>{point}</p>)}
        </div>
      </section>

      <section className="reference-zone">
        <div className="section-heading">
          <p className="section-kicker">Jump In</p>
          <h2>从这些入口直接开始</h2>
        </div>
        <div className="reference-links">
          {referenceLinks.map(link => (
            <Link key={link.href} href={link.href} className="reference-link">
              <span>{link.label}</span>
              <strong>OPEN</strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
