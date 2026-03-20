import {useMDXComponents as getDocsMDXComponents} from 'nextra-theme-docs'

const docsComponents = getDocsMDXComponents()

type MDXComponents = Record<string, unknown>

export function useMDXComponents(components: MDXComponents = {}): MDXComponents {
  return {
    ...docsComponents,
    ...components
  }
}
