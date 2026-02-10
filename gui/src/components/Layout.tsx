import type { FC, ReactNode } from 'react'
import { useCallback, useState } from 'react'

import Sidebar from './Sidebar'

interface LayoutProps {
  readonly children: ReactNode
}

const COLLAPSED_KEY = 'sidebar-collapsed'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

const Layout: FC<LayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch { /* noop */ }
      return next
    })
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  )
}

export default Layout
