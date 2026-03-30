import {zodToJsonSchema} from 'zod-to-json-schema'
import {ZUserConfigFile} from './plugins/plugin-core'

/**
 * JSON Schema for .tnmsc.json — auto-generated from ZUserConfigFile via zod-to-json-schema.
 * Do not edit manually; update ZUserConfigFile in types/ConfigTypes.schema.ts instead.
 */
export const TNMSC_JSON_SCHEMA = zodToJsonSchema(ZUserConfigFile, {
  name: 'UserConfigFile',
  nameStrategy: 'title',
  $refStrategy: 'none',
  target: 'jsonSchema7',
  definitionPath: '$defs'
})
