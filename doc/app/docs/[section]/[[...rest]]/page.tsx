import type { ComponentType, ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../../../mdx-components'
import { isDocSectionName } from '../../../../lib/docs-sections'

const getAllDocParams = generateStaticParamsFor('mdxPath')

function isSectionDocParam(
  value: { mdxPath?: string[] },
): value is { mdxPath: [string, ...string[]] } {
  return value.mdxPath != null
    && value.mdxPath.length > 0
    && isDocSectionName(value.mdxPath[0])
}

export async function generateStaticParams() {
  const allParams = await getAllDocParams()
  return (allParams as { mdxPath?: string[] }[])
    .filter(isSectionDocParam)
    .map(p => ({
      section: p.mdxPath[0],
      rest: p.mdxPath.length > 1 ? p.mdxPath.slice(1) : undefined,
    }))
}

export async function generateMetadata(props: {
  readonly params: Promise<{ readonly section: string; readonly rest?: string[] }>
}) {
  const params = await props.params
  if (!isDocSectionName(params.section)) notFound()
  const mdxPath = [params.section, ...(params.rest ?? [])]
  const { metadata } = await importPage(mdxPath)
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

export default async function SectionPage(props: {
  readonly params: Promise<{ readonly section: string; readonly rest?: string[] }>
}) {
  const params = await props.params
  if (!isDocSectionName(params.section)) notFound()
  const mdxPath = [params.section, ...(params.rest ?? [])]
  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode,
  } = await importPage(mdxPath)

  const page = <MDXContent {...props} params={params} />

  if (!Wrapper) {
    return page
  }

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      {page}
    </Wrapper>
  )
}
