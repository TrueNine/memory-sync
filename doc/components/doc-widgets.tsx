import type {ReactNode} from 'react'

type BadgeTone
  = | 'stable'
    | 'full'
    | 'partial'
    | 'planned'
    | 'beta'
    | 'experimental'
    | 'deprecated'
    | 'unsupported'
    | 'info'

type Badge
  = | BadgeTone
    | {
      label: string
      tone?: BadgeTone
    }

interface SharedProps {
  title?: string
  description?: ReactNode
}

interface FeatureMatrixItem {
  tool: string
  summary?: ReactNode
  capabilities?: ReactNode | ReactNode[]
  surfaces?: ReactNode | ReactNode[]
  notes?: ReactNode
  status?: Badge
}

interface SupportMatrixItem {
  system: string
  support: Badge
  coverage?: ReactNode | ReactNode[]
  notes?: ReactNode
}

interface PlatformGridItem {
  name: string
  family?: string
  description: ReactNode
  highlights?: ReactNode[]
  support?: Badge
}

interface CommandReferenceItem {
  stack: string
  task: string
  command: string | string[]
  runtime?: ReactNode
  notes?: ReactNode
}

interface FeatureMatrixProps extends SharedProps {
  items: FeatureMatrixItem[]
}

interface SupportMatrixProps extends SharedProps {
  items: SupportMatrixItem[]
}

interface PlatformGridProps extends SharedProps {
  items: PlatformGridItem[]
}

interface CommandReferenceProps extends SharedProps {
  items: CommandReferenceItem[]
}

function hasText(value?: string): value is string {
  return value !== void 0 && value.length > 0
}

function hasNode(value?: ReactNode): value is Exclude<ReactNode, null | undefined | false> {
  return value !== void 0 && value !== null && value !== false
}

function renderBadge(badge?: Badge): ReactNode {
  if (badge === void 0) {
    return null
  }

  const tone = typeof badge === 'string' ? badge : badge.tone ?? 'info'
  const label = typeof badge === 'string' ? formatToneLabel(badge) : badge.label

  return (
    <span className={`docs-badge docs-badge--${tone}`} data-tone={tone}>
      {label}
    </span>
  )
}

function renderContent(value?: ReactNode | ReactNode[]): ReactNode {
  if (value === void 0) {
    return <span className="docs-muted">-</span>
  }

  if (!Array.isArray(value)) {
    return value
  }

  if (value.length === 0) {
    return <span className="docs-muted">-</span>
  }

  return (
    <ul className="docs-table-list">
      {value.map((item, index) => <li key={getListKey(item, index)}>{item}</li>)}
    </ul>
  )
}

function renderCommand(command: string | string[]): ReactNode {
  const lines = Array.isArray(command) ? command : [command]

  return (
    <div className="docs-command-stack">
      {lines.map((line, index) => (
        <code className="docs-command-chip" key={`${line}-${index}`}>
          {line}
        </code>
      ))}
    </div>
  )
}

function renderSectionHeader(title?: string, description?: ReactNode): ReactNode {
  const hasTitle = hasText(title)
  const hasDescription = hasNode(description)

  if (!hasTitle && !hasDescription) {
    return null
  }

  return (
    <header className="docs-widget-header">
      {hasTitle ? <h3>{title}</h3> : null}
      {hasDescription ? <p>{description}</p> : null}
    </header>
  )
}

function renderOptionalNode(value?: ReactNode): ReactNode {
  return hasNode(value) ? value : <span className="docs-muted">-</span>
}

function formatToneLabel(tone: BadgeTone): string {
  switch (tone) {
    case 'stable':
      return 'Stable'
    case 'full':
      return 'Full'
    case 'partial':
      return 'Partial'
    case 'planned':
      return 'Planned'
    case 'beta':
      return 'Beta'
    case 'experimental':
      return 'Experimental'
    case 'deprecated':
      return 'Deprecated'
    case 'unsupported':
      return 'Unsupported'
    default:
      return 'Info'
  }
}

function getListKey(item: ReactNode, index: number): string | number {
  if (typeof item === 'string' || typeof item === 'number') {
    return `${item}-${index}`
  }

  return index
}

export function FeatureMatrix({title, description, items}: FeatureMatrixProps): ReactNode {
  return (
    <section className="docs-widget">
      {renderSectionHeader(title, description)}
      <div className="docs-table-shell">
        <table className="docs-widget-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Core Capability</th>
              <th>Entry / Surface</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.tool}>
                <td>
                  <div className="docs-cell-heading">
                    <strong>{item.tool}</strong>
                    {item.status !== void 0 ? <div>{renderBadge(item.status)}</div> : null}
                  </div>
                  {hasNode(item.summary) ? <div className="docs-muted">{item.summary}</div> : null}
                </td>
                <td>{renderContent(item.capabilities)}</td>
                <td>{renderContent(item.surfaces)}</td>
                <td>{renderOptionalNode(item.notes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function SupportMatrix({title, description, items}: SupportMatrixProps): ReactNode {
  return (
    <section className="docs-widget">
      {renderSectionHeader(title, description)}
      <div className="docs-table-shell">
        <table className="docs-widget-table">
          <thead>
            <tr>
              <th>System</th>
              <th>Support</th>
              <th>Coverage</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.system}>
                <td>
                  <strong>{item.system}</strong>
                </td>
                <td>{renderBadge(item.support)}</td>
                <td>{renderContent(item.coverage)}</td>
                <td>{renderOptionalNode(item.notes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function PlatformGrid({title, description, items}: PlatformGridProps): ReactNode {
  return (
    <section className="docs-widget">
      {renderSectionHeader(title, description)}
      <div className="docs-platform-grid">
        {items.map(item => {
          const hasFamily = hasText(item.family)
          const hasSupport = item.support !== void 0
          const highlights = item.highlights ?? []
          const hasHighlights = highlights.length > 0

          return (
            <article className="docs-platform-card" key={item.name}>
              <div className="docs-platform-card__top">
                <div>
                  {hasFamily ? <span className="docs-platform-card__family">{item.family}</span> : null}
                  <h3>{item.name}</h3>
                </div>
                {hasSupport ? renderBadge(item.support) : null}
              </div>
              <p>{item.description}</p>
              {hasHighlights
                ? (
                    <ul className="docs-platform-card__highlights">
                      {highlights.map((highlight, index) => <li key={getListKey(highlight, index)}>{highlight}</li>)}
                    </ul>
                  )
                : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function CommandReference({title, description, items}: CommandReferenceProps): ReactNode {
  return (
    <section className="docs-widget">
      {renderSectionHeader(title, description)}
      <div className="docs-table-shell">
        <table className="docs-widget-table">
          <thead>
            <tr>
              <th>Stack</th>
              <th>Task</th>
              <th>Command</th>
              <th>Runtime</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.stack}-${item.task}-${index}`}>
                <td>
                  <strong>{item.stack}</strong>
                </td>
                <td>{item.task}</td>
                <td>{renderCommand(item.command)}</td>
                <td>{renderOptionalNode(item.runtime)}</td>
                <td>{renderOptionalNode(item.notes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
