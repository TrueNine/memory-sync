import type {ReactNode} from 'react'
import Link from 'next/link'
import {Footer, Layout, Navbar} from 'nextra-theme-docs'
import {Head} from 'nextra/components'
import {getPageMap} from 'nextra/page-map'
import {siteConfig} from '../../lib/site'

export default async function DocsLayout({children}: {readonly children: ReactNode}) {
  const pageMap = await getPageMap('/docs')

  return (
    <>
      <Head faviconGlyph="R" />
      <Layout
        pageMap={pageMap}
        navbar={(
          <Navbar
            logoLink="/"
            projectLink={siteConfig.repoUrl}
            logo={(
              <div className="docs-logo-lockup">
                <span className="docs-logo-mark">MS</span>
                <span className="docs-logo-copy">
                  <strong>memory-sync</strong>
                  <small>prompt logistics for tool rats</small>
                </span>
              </div>
            )}
          >
            <Link href="/" className="docs-top-link">
              Manifesto
            </Link>
            <Link href="/docs" className="docs-top-link">
              文档
            </Link>
          </Navbar>
        )}
        footer={(
          <Footer>
            AGPL-3.0-only · 基于真实仓库结构维护 · 文档部署自动化目前仍未在本仓库中落地
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
          autoCollapse: true,
          defaultMenuCollapseLevel: 1
        }}
        toc={{
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
    </>
  )
}
