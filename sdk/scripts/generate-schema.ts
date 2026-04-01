import {writeFileSync} from 'node:fs'
import {TNMSC_JSON_SCHEMA} from '../src/schema.ts'

writeFileSync('./dist/tnmsc.schema.json', `${JSON.stringify(TNMSC_JSON_SCHEMA, null, 2)}\n`, 'utf8')
console.log('Schema generated successfully!')
