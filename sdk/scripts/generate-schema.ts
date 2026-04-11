import {writeFileSync} from 'node:fs'
import markdownOutput from '../../scripts/markdown-output'
import {TNMSC_JSON_SCHEMA} from '../src/schema.ts'

const {writeMarkdownBlock} = markdownOutput

writeFileSync('./dist/tnmsc.schema.json', `${JSON.stringify(TNMSC_JSON_SCHEMA, null, 2)}\n`, 'utf8')
writeMarkdownBlock('Schema generation complete', {
  output: './dist/tnmsc.schema.json',
})
