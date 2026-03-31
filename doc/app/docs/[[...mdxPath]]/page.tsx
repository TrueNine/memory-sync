import type {ComponentType, ReactNode} from 'react'
import {generateStaticParamsFor, importPage} from 'nextra/pages'
import {useMDXComponents as getMDXComponents} from '../../../mdx-components'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

export async function generateMetadata(props: {
  readonly params: Promise<{readonly mdxPath?: string[]}>
}) {
  const params = await props.params
  const {metadata} = await importPage(params.mdxPath)
  return metadata
}

interface WrapperProps {
  readonly children: ReactNode
  readonly metadata: unknown
  readonly sourceCode: string
  readonly toc: unknown
}

const components = getMDXComponents() as {
  readonly wrapper?: ComponentType<WrapperProps>
}

const Wrapper = components.wrapper

export default async function DocsPage(props: {
  readonly params: Promise<{readonly mdxPath?: string[]}>
}) {
  const params = await props.params
  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode
  } = await importPage(params.mdxPath)

  const page = <MDXContent {...props} params={params} components={components} />

  if (!Wrapper) {
    return page
  }

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      {page}
    </Wrapper>
  )
}
