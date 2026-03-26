'use client'

import Link from 'next/link'
import {useParams} from 'next/navigation'
import {DOC_SECTION_LINKS} from '../lib/docs-sections'

export function DocsSectionNav() {
  const params = useParams<{section?: string | string[]}>()
  const currentSection = Array.isArray(params.section) ? params.section[0] : params.section

  return (
    <div className="docs-section-nav" aria-label="一级文档分区切换">
      <div className="docs-section-nav__meta">
        <span className="docs-section-nav__label">一级文档分区</span>
        <span className="docs-section-nav__hint">
          切换后会更新左侧目录与右侧本页目录
        </span>
      </div>
      <div className="docs-navbar-links">
        {DOC_SECTION_LINKS.map(link => {
          const isActive = currentSection === link.section

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={`docs-nav-link${isActive ? ' is-active' : ''}`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
