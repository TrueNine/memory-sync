'use client'

import type {ReactNode} from 'react'
import {useId, useState} from 'react'
import {DocsCodeBlock} from './docs-code-block'

type PackageManager = 'npm' | 'pnpm' | 'yarn'

interface PackageManagerTabsProps {
  readonly commands: Record<PackageManager, string | string[]>
  readonly defaultManager?: PackageManager
  readonly description?: ReactNode
  readonly recommendedManager?: PackageManager
  readonly title?: string
}

interface PackageManagerTab {
  readonly command: string | string[]
  readonly id: PackageManager
  readonly label: string
}

const TAB_ORDER: PackageManager[] = ['npm', 'pnpm', 'yarn']

function normalizeCommand(command: string | string[]): string {
  return Array.isArray(command) ? command.join('\n') : command
}

function renderCode(command: string): ReactNode {
  return <code>{command}</code>
}

export function PackageManagerTabs({
  commands,
  defaultManager = 'pnpm',
  description,
  recommendedManager = 'pnpm',
  title
}: PackageManagerTabsProps): ReactNode {
  const instanceId = useId()
  const [selectedManager, setSelectedManager] = useState<PackageManager>(defaultManager)
  const tabs: PackageManagerTab[] = TAB_ORDER.map(id => ({
    command: commands[id],
    id,
    label: id
  }))
  const activeTab = tabs.find(tab => tab.id === selectedManager) ?? tabs[0]

  if (activeTab == null) {
    return null
  }

  const activeCommand = normalizeCommand(activeTab.command)
  const tabPanelId = `${instanceId}-${activeTab.id}-panel`

  return (
    <section className="docs-package-manager-tabs">
      {title || description ? (
        <header className="docs-widget-header">
          {title ? <h3>{title}</h3> : null}
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      <div className="docs-package-manager-tabs-list" role="tablist" aria-label="Package manager commands">
        {tabs.map(tab => {
          const isSelected = tab.id === activeTab.id
          const tabId = `${instanceId}-${tab.id}-tab`

          return (
            <button
              key={tab.id}
              id={tabId}
              type="button"
              role="tab"
              aria-controls={tabPanelId}
              aria-selected={isSelected}
              className={`docs-package-manager-tab${isSelected ? ' docs-package-manager-tab--active' : ''}`}
              onClick={() => {
                setSelectedManager(tab.id)
              }}
            >
              {tab.label}
              {tab.id === recommendedManager ? (
                <span className="docs-package-manager-tab-badge">推荐</span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div id={tabPanelId} role="tabpanel" aria-labelledby={`${instanceId}-${activeTab.id}-tab`}>
        <DocsCodeBlock
          language="SHELL"
          filename={activeTab.label}
          code={activeCommand}
          preProps={{}}
        >
          {renderCode(activeCommand)}
        </DocsCodeBlock>
      </div>
    </section>
  )
}
