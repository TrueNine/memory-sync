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
              <div className="docs-brand">
                <span className="docs-brand-title">memory-sync</span>
              </div>
            )}
          >
            <Link href="/" className="docs-nav-link">
              首页
            </Link>
            <Link href="/docs" className="docs-nav-link">
              文档
            </Link>
          </Navbar>
        )}
        footer={(
          <Footer>
            AGPL-3.0-only · 仅记录仓库真实能力与当前实现边界
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
