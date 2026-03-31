import type {ReactNode} from 'react'
import {Layout, Navbar} from 'nextra-theme-docs'
import {getPageMap} from 'nextra/page-map'
import {DocsSectionNav} from '../../../components/docs-section-nav'
import {isDocSectionName} from '../../../lib/docs-sections'
import {siteConfig} from '../../../lib/site'

export default async function DocsLayout({
  children,
  params: paramsPromise
}: {
  readonly children: ReactNode
  readonly params: Promise<{readonly mdxPath?: string[]}>
}) {
  const params = await paramsPromise
  const firstSegment = params.mdxPath?.[0]
  const section = firstSegment != null && isDocSectionName(firstSegment)
    ? firstSegment
    : undefined
  const pageMap = await getPageMap(section ? `/docs/${section}` : '/docs')

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
            <DocsSectionNav />
            <div className="docs-navbar-actions">
              <a href={siteConfig.repoUrl} target="_blank" rel="noreferrer" className="docs-navbar-action">
                GitHub
              </a>
            </div>
          </div>
        </Navbar>
      )}
      docsRepositoryBase={`${siteConfig.docsRepositoryBase}/content`}
      editLink="在 GitHub 上编辑此页"
      feedback={{
        content: '有遗漏或过时信息？提交 issue',
        link: siteConfig.issueUrl,
        labels: 'documentation'
      }}
      darkMode={false}
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
        forcedTheme: 'dark',
        storageKey: 'memory-sync-docs-theme'
      }}
    >
      {children}
    </Layout>
  )
}
