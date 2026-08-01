import type {ComponentPropsWithoutRef, ReactElement, ReactNode} from 'react'
import {useMDXComponents as getDocsMDXComponents} from 'nextra-theme-docs'
import {isValidElement} from 'react'
import {CommandReference, FeatureMatrix, PlatformGrid, SupportMatrix} from './components/doc-widgets'
import {DocsBlockquote} from './components/docs-callout'
import {DocsCodeBlock} from './components/docs-code-block'
import {Mermaid} from './components/mermaid'
import {PackageManagerTabs} from './components/package-manager-tabs'

type MDXComponents = Record<string, unknown>
type MermaidPreProps = ComponentPropsWithoutRef<'pre'> & {
  'data-filename'?: string
  'data-language'?: string
  'data-pagefind-ignore'?: string
}

function extractMermaidChart(node: ReactNode): string {
  if (typeof node === 'string') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map(extractMermaidChart).join('')
  }

  if (isValidElement(node)) {
    return extractMermaidChart((node as ReactElement<{children?: ReactNode}>).props.children)
  }

  return ''
}

function normalizeMermaidChart(chart: string): string {
  return chart
    .replaceAll('\\r\\n', '\n')
    .replaceAll('\\n', '\n')
    .replaceAll('\\t', '  ')
    .trim()
}

function extractCodeText(node: ReactNode): string {
  if (typeof node === 'string') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map(extractCodeText).join('')
  }

  if (isValidElement(node)) {
    return extractCodeText((node as ReactElement<{children?: ReactNode}>).props.children)
  }

  return ''
}

function formatLanguageLabel(language?: string): string {
  if (language == null || language === '') {
    return 'TEXT'
  }

  const shellLanguages = new Set(['shell', 'bash', 'sh', 'zsh'])

  if (shellLanguages.has(language)) {
    return 'SHELL'
  }

  if (language === 'tsx') {
    return 'TSX'
  }

  if (language === 'ts') {
    return 'TS'
  }

  if (language === 'js') {
    return 'JS'
  }

  if (language === 'jsx') {
    return 'JSX'
  }

  if (language === 'json') {
    return 'JSON'
  }

  if (language === 'md' || language === 'mdx') {
    return 'MDX'
  }

  return language.toUpperCase()
}

function DocsCodeBlockPre(props: MermaidPreProps) {
  const pagefindIgnore = props['data-pagefind-ignore']
  const filename = props['data-filename']
  const {
    children,
    className,
    ...preProps
  } = props
  const code = extractCodeText(children).trimEnd()
  const language = formatLanguageLabel(props['data-language'])

  return (
    <DocsCodeBlock
      language={language}
      filename={filename}
      code={code}
      pagefindIgnore={pagefindIgnore}
      className={className}
      preProps={preProps}
    >
      {children}
    </DocsCodeBlock>
  )
}

function MermaidPre(props: MermaidPreProps & {
  readonly DocsPre?: (props: MermaidPreProps) => ReactNode
}) {
  const {DocsPre, ...preProps} = props

  if (preProps['data-language'] !== 'mermaid' || !DocsPre) {
    return <DocsCodeBlockPre {...preProps} />
  }

  const chart = normalizeMermaidChart(extractMermaidChart(preProps.children))

  if (!chart) {
    return <DocsPre {...preProps} />
  }

  return <Mermaid chart={chart} title={preProps['data-filename']} />
}

export function useMDXComponents(components: MDXComponents = {}): MDXComponents {
  const docsComponents = getDocsMDXComponents()
  const DocsPre = docsComponents.pre as ((props: MermaidPreProps) => ReactNode) | undefined

  return {
    ...docsComponents,
    blockquote: DocsBlockquote,
    CommandReference,
    FeatureMatrix,
    Mermaid,
    PackageManagerTabs,
    PlatformGrid,
    SupportMatrix,
    pre: (props: MermaidPreProps) => <MermaidPre {...props} DocsPre={DocsPre} />,
    ...components
  }
}
