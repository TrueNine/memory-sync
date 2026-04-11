import type {FC, ReactNode} from 'react'

import {cn} from '@/lib/utils'

interface MarkdownLogBlockProps {
  readonly markdown: string
  readonly className?: string
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).flatMap((segment, segmentIndex) => {
    if (/^`[^`]+`$/u.test(segment)) {
      return (
        <code
          key={`code-${segmentIndex}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.95em]"
        >
          {segment.slice(1, -1)}
        </code>
      )
    }

    return segment.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) => {
      if (/^\*\*[^*]+\*\*$/u.test(part)) {
        return (
          <strong key={`strong-${segmentIndex}-${partIndex}`} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        )
      }

      return <span key={`text-${segmentIndex}-${partIndex}`}>{part}</span>
    })
  })
}

function isMarkdownListBlock(lines: readonly string[]): boolean {
  return lines.every((line) => line.trim().length === 0 || /^\s*(?:- |\d+\. )/u.test(line))
}

export const MarkdownLogBlock: FC<MarkdownLogBlockProps> = ({markdown, className}) => {
  const blocks = markdown.trim().split(/\n{2,}/u).filter((block) => block.trim().length > 0)

  return (
    <article className={cn('flex flex-col gap-3', className)}>
      {blocks.map((block, index) => {
        const lines = block.split('\n')
        const firstLine = lines[0]?.trim() ?? ''

        if (firstLine.startsWith('### ')) {
          return (
            <h3 key={index} className="text-sm font-semibold text-foreground">
              {renderInlineMarkdown(firstLine.slice(4))}
            </h3>
          )
        }

        if (lines.length === 1 && /^\*\*[^*]+\*\*$/u.test(firstLine)) {
          return (
            <h4 key={index} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {renderInlineMarkdown(firstLine)}
            </h4>
          )
        }

        if (isMarkdownListBlock(lines)) {
          return (
            <pre
              key={index}
              className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground"
            >
              {block}
            </pre>
          )
        }

        return (
          <p key={index} className="whitespace-pre-wrap break-words text-sm text-foreground">
            {renderInlineMarkdown(block)}
          </p>
        )
      })}
    </article>
  )
}
