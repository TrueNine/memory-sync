import type { FC } from 'react'

import {
    ChevronLeft,
    ChevronRight,
    Cog,
    FileText,
    LayoutDashboard,
    Plug,
    ScrollText,
    Workflow,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

interface NavItem {
  readonly to: string
  readonly labelKey: string
  readonly icon: FC<{ className?: string }>
}

const navItems: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/pipeline', labelKey: 'nav.pipeline', icon: Workflow },
  { to: '/config', labelKey: 'nav.config', icon: FileText },
  { to: '/plugins', labelKey: 'nav.plugins', icon: Plug },
  { to: '/logs', labelKey: 'nav.logs', icon: ScrollText },
  { to: '/settings', labelKey: 'nav.settings', icon: Cog },
]

interface SidebarProps {
  readonly collapsed: boolean
  readonly onToggle: () => void
}

const Sidebar: FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const { t } = useI18n()

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className="flex h-14 items-center border-b border-sidebar-border px-3">
        {collapsed ? (
          <button type="button" onClick={onToggle} className="mx-auto p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground" title={t('app.title')}>
            <Workflow className="h-5 w-5 text-sidebar-primary" />
          </button>
        ) : (
          <>
            <Workflow className="h-5 w-5 shrink-0 text-sidebar-primary" />
            <span className="ml-2 text-sm font-semibold truncate">{t('app.title')}</span>
            <button type="button" onClick={onToggle} className="ml-auto p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                title={collapsed ? t(item.labelKey) : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-md text-sm transition-colors',
                    collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {collapsed && (
        <div className="border-t border-sidebar-border px-2 py-3">
          <button type="button" onClick={onToggle} className="flex w-full items-center justify-center rounded-md px-2 py-2 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  )
}

export default Sidebar
