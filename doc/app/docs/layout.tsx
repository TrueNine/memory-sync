import type {ReactNode} from 'react'
import Link from 'next/link'
import {Footer, Layout, Navbar} from 'nextra-theme-docs'
import {getPageMap} from 'nextra/page-map'
import {siteConfig} from '../../lib/site'

export default async function DocsLayout({children}: {readonly children: ReactNode}) {
  const pageMap = await getPageMap('/docs')
  const sectionLinks = [
    {href: '/docs/cli', label: 'CLI'},
    {href: '/docs/mcp', label: 'MCP'},
    {href: '/docs/gui', label: 'GUI'},
    {href: '/docs/technical-details', label: '技术细节'},
    {href: '/docs/design-rationale', label: '设计初衷'}
  ] as const

  return (
    <Layout
      pageMap={pageMap}
      navbar={(
        <Navbar
          className="docs-site-navbar"
          logoLink="/"
          logo={(
            <div className="docs-brand">
              <span className="docs-brand-badge">Docs</span>
              <span className="docs-brand-title">memory-sync</span>
            </div>
          )}
        >
          <div className="docs-navbar-shell">
            <nav className="docs-navbar-links" aria-label="Primary">
              {sectionLinks.map(link => (
                <Link key={link.href} href={link.href} className="docs-nav-link">
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="docs-navbar-actions">
              <a href={siteConfig.repoUrl} target="_blank" rel="noreferrer" className="docs-navbar-action">
                GitHub
              </a>
            </div>
          </div>
        </Navbar>
      )}
      footer={(
        <Footer>
          AGPL-3.0-only · 面向当前仓库实现、命令表面与配置边界
        </Footer>
      )}
      docsRepositoryBase={`${siteConfig.docsRepositoryBase}/content`}
      editLink="在 GitHub 上编辑此页"
      feedback={{
        content: '有遗漏或过时信息？提交 issue',
        link: siteConfig.issueUrl,
        labels: 'documentation'
      }}
      sidebar={{
        autoCollapse: false,
        defaultMenuCollapseLevel: 99,
        defaultOpen: true,
        toggleButton: false
      }}
      toc={{
        float: true,
        title: '本页目录',
        backToTop: '回到顶部'
      }}
      themeSwitch={{
        dark: '暗色',
        light: '亮色',
        system: '系统'
      }}
      nextThemes={{
        attribute: 'class',
        defaultTheme: 'dark',
        disableTransitionOnChange: true,
        storageKey: 'memory-sync-docs-theme'
      }}
    >
      {children}
    </Layout>
  )
}
