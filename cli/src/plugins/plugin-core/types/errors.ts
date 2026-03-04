export class MissingDependencyError extends Error {
  readonly pluginName: string

  readonly missingDependency: string

  constructor(pluginName: string, missingDependency: string) {
    super(`Plugin "${pluginName}" depends on missing plugin "${missingDependency}"`)
    this.name = 'MissingDependencyError'
    this.pluginName = pluginName
    this.missingDependency = missingDependency
  }
}

export class CircularDependencyError extends Error {
  readonly cyclePath: readonly string[]

  constructor(cyclePath: readonly string[]) {
    super(`Circular plugin dependency detected: ${cyclePath.join(' -> ')}`)
    this.name = 'CircularDependencyError'
    this.cyclePath = [...cyclePath]
  }
}
