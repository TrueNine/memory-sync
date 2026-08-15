import type {ReactNode} from 'react'
import {getPageMap} from 'nextra/page-map'
import {DocsSectionNav} from '../../../components/docs-section-nav'
import {isDocSectionName} from '../../../lib/docs-sections'
import {siteConfig, withBasePath} from '../../../lib/site'

interface PageMapItem {
  readonly name?: string
  readonly route?: string
  readonly title?: string
  readonly children?: readonly PageMapItem[]
}

function DocsSidebar({pageMap}: {readonly pageMap: readonly PageMapItem[]}) {
  return (
    <nav className="docs-sidebar" aria-label="Documentation">
      {pageMap.map(item => {
        if (item.name == null || item.name === '' || item.route == null) {
          return null
        }

        return (
          <a key={item.route} href={withBasePath(item.route)}>
            {item.title ?? item.name}
          </a>
        )
      })}
    </nav>
  )
}

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
    : void 0
  const pageMap = await getPageMap(section != null ? `/docs/${section}` : '/docs') as readonly PageMapItem[]

  return (
    <div className="docs-shell">
      <header className="docs-site-navbar">
        <a href={withBasePath('/')} className="docs-brand">
          <span className="docs-brand-badge">Docs</span>
          <span className="docs-brand-title">croessweave</span>
        </a>
        <div className="docs-navbar-shell">
          <DocsSectionNav />
          <div className="docs-navbar-shell">
            <a href={siteConfig.repoUrl} target="_blank" rel="noreferrer" className="docs-navbar-action">
              GitHub
            </a>
          </div>
        </div>
      </header>
      <div className="docs-content-shell">
        <DocsSidebar pageMap={pageMap} />
        <main className="docs-content">
          {children}
          <footer className="docs-page-footer">
            <a href={`${siteConfig.docsRepositoryBase}/content`} target="_blank" rel="noreferrer">
              在 GitHub 上编辑文档
            </a>
            <a href={siteConfig.issueUrl} target="_blank" rel="noreferrer">
              提交文档 issue
            </a>
          </footer>
        </main>
      </div>
    </div>
  )
}
