import type {ComponentPropsWithoutRef, ReactElement, ReactNode} from 'react'
import {useMDXComponents as getDocsMDXComponents} from 'nextra-theme-docs'
import {isValidElement} from 'react'
import {Mermaid} from './components/mermaid'

const docsComponents = getDocsMDXComponents()
const DocsPre = docsComponents.pre as ((props: MermaidPreProps) => ReactNode) | undefined

type MDXComponents = Record<string, unknown>
type MermaidPreProps = ComponentPropsWithoutRef<'pre'> & {
  'data-filename'?: string
  'data-language'?: string
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

function MermaidPre(props: MermaidPreProps) {
  if (props['data-language'] !== 'mermaid' || !DocsPre) {
    return DocsPre ? <DocsPre {...props} /> : <pre {...props} />
  }

  const chart = extractMermaidChart(props.children).trim()

  if (!chart) {
    return <DocsPre {...props} />
  }

  return <Mermaid chart={chart} title={props['data-filename']} />
}

export function useMDXComponents(components: MDXComponents = {}): MDXComponents {
  return {
    ...docsComponents,
    Mermaid,
    pre: MermaidPre,
    ...components
  }
}
