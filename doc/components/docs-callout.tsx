import type {ComponentPropsWithoutRef, ReactElement, ReactNode} from 'react'
import {Children, cloneElement, isValidElement} from 'react'

type CalloutTone = 'note' | 'tip' | 'important' | 'warning' | 'caution'

type BlockquoteProps = ComponentPropsWithoutRef<'blockquote'>

const CALLOUT_PATTERN = /^\s*\[!(note|tip|important|warning|caution)\]\s*/i

const CALLOUT_LABELS: Record<CalloutTone, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution'
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

  return items.map((item, index) => {
    if (index !== 0) {
      return item
    }

    if (typeof item === 'string') {
      return item.replace(CALLOUT_PATTERN, '')
    }

    if (!isValidElement(item)) {
      return item
    }

    const element = item as ReactElement<{children?: ReactNode}>
    const text = extractText(element.props.children)

    if (!CALLOUT_PATTERN.test(text)) {
      return item
    }

    return cloneElement(element, {
      ...element.props,
      children: text.replace(CALLOUT_PATTERN, '')
    })
  })
}

function resolveCalloutTone(children: ReactNode): CalloutTone | null {
  const firstChild = getMeaningfulChildren(children)[0]
  const firstText = extractText(firstChild).trimStart()
  const matched = firstText.match(CALLOUT_PATTERN)?.[1]?.toLowerCase()

  if (
    matched === 'note'
    || matched === 'tip'
    || matched === 'important'
    || matched === 'warning'
    || matched === 'caution'
  ) {
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
