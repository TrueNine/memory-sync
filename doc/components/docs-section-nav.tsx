'use client'

import Link from 'next/link'
import {useParams} from 'next/navigation'
import {DOC_SECTION_LINKS} from '../lib/docs-sections'

export function DocsSectionNav() {
  const params = useParams()
  const mdxPath = params.mdxPath as string[] | undefined
  const currentSection = mdxPath?.[0]

  return (
    <div className="docs-section-nav" aria-label="Section Navigation">
      <div className="docs-navbar-links">
        {DOC_SECTION_LINKS.map(link => {
          const isActive = currentSection === link.section

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : void 0}
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
