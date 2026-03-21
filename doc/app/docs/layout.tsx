import type {ReactNode} from 'react'
import {Footer, Layout, Navbar} from 'nextra-theme-docs'
import {getPageMap} from 'nextra/page-map'
import {siteConfig} from '../../lib/site'

export default async function DocsLayout({children}: {readonly children: ReactNode}) {
  const pageMap = await getPageMap('/docs')

  return (
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
        />
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
