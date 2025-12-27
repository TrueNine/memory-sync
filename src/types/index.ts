export * from './ConfigTypes'
export * from './Enums'
export * from './Errors'
export * from './FileSystemTypes'
export * from './InputTypes'
export * from './OutputTypes'
export * from './PluginTypes'
export * from './PromptTypes'
export * from './RegistryTypes'
export * from './ShadowSourceProjectTypes'

// NOTE: Abstract plugin classes are NOT re-exported here to avoid circular dependencies.
// Import them directly from '@/plugins' instead:
//   import { AbstractInputPlugin, AbstractOutputPlugin, AbstractPlugin } from '@/plugins'
// Types like AbstractOutputPluginOptions, FastCommandNameTransformOptions, ResolvedBasePaths
// are also available from '@/plugins'.
