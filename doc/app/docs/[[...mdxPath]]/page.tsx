import {generateStaticParamsFor, importPage} from 'nextra/pages'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

export async function generateMetadata(props: {
  readonly params: Promise<{readonly mdxPath?: string[]}>
}) {
  const params = await props.params
  const {metadata} = await importPage(params.mdxPath)
  return metadata
}

export default async function DocsPage(props: {
  readonly params: Promise<{readonly mdxPath?: string[]}>
}) {
  const params = await props.params
  const {default: MDXContent} = await importPage(params.mdxPath)

  return <MDXContent {...props} params={params} />
}
