import type {ComponentPropsWithoutRef, ReactElement, ReactNode} from 'react'
import {Children, cloneElement, isValidElement} from 'react'

type CalloutTone = 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'danger'

type BlockquoteProps = ComponentPropsWithoutRef<'blockquote'>

const CALLOUT_PATTERN = /^\s*\[!(note|tip|important|warning|caution|danger)\]\s*/i
const CALLOUT_TONES = new Set<CalloutTone>(['note', 'tip', 'important', 'warning', 'caution', 'danger'])

const CALLOUT_LABELS: Record<CalloutTone, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
  danger: 'Danger'
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map(extractText).join('')
  }

  if (isValidElement(node)) {
    return extractText((node as ReactElement<{children?: ReactNode}>).props.children)
  }

  return ''
}

function getMeaningfulChildren(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter(child => {
    if (typeof child !== 'string') {
      return true
    }

    return child.trim() !== ''
  })
}

function stripMarkerFromChildren(children: ReactNode): ReactNode {
  const items = getMeaningfulChildren(children)
  const strippedItems: ReactNode[] = []

  for (const [index, item] of items.entries()) {
    if (index !== 0) {
      strippedItems.push(item)
      continue
    }

    if (typeof item === 'string') {
      strippedItems.push(item.replace(CALLOUT_PATTERN, ''))
      continue
    }

    if (!isValidElement(item)) {
      strippedItems.push(item)
      continue
    }

    const element = item as ReactElement<{children?: ReactNode}>
    const text = extractText(element.props.children)

    if (!CALLOUT_PATTERN.test(text)) {
      strippedItems.push(item)
      continue
    }

    strippedItems.push(cloneElement(element, {
      ...element.props,
      children: text.replace(CALLOUT_PATTERN, '')
    }))
  }

  return strippedItems
}

function isCalloutTone(value: string | undefined): value is CalloutTone {
  return value != null && CALLOUT_TONES.has(value as CalloutTone)
}

function resolveCalloutTone(children: ReactNode): CalloutTone | null {
  const firstChild = getMeaningfulChildren(children)[0]
  const firstText = extractText(firstChild).trimStart()
  const matched = CALLOUT_PATTERN.exec(firstText)?.[1]?.toLowerCase()

  if (isCalloutTone(matched)) {
    return matched
  }

  return null
}

export function DocsBlockquote({children, className, ...props}: BlockquoteProps) {
  const tone = resolveCalloutTone(children)

  if (tone == null) {
    return (
      <blockquote className={className} {...props}>
        {children}
      </blockquote>
    )
  }

  return (
    <div
      className={[
        'docs-callout',
        `docs-callout--${tone}`,
        className ?? ''
      ].join(' ').trim()}
      data-tone={tone}
    >
      <div className="docs-callout__title">{CALLOUT_LABELS[tone]}</div>
      <div className="docs-callout__content">{stripMarkerFromChildren(children)}</div>
    </div>
  )
}
