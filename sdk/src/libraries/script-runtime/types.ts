export type ProxyCommand = 'install' | 'dry-run' | 'clean' | 'plugins'

export interface ProxyContext {
  readonly cwd: string
  readonly workspaceDir: string
  readonly aindexDir: string
  readonly command: ProxyCommand
  readonly platform: NodeJS.Platform
}

export interface ProxyMatcherConfig {
  readonly commands?: readonly ProxyCommand[]
}

export interface ProxyModuleConfig {
  readonly matcher?: ProxyMatcherConfig
}

export type ProxyRouteHandler = (
  logicalPath: string,
  ctx: ProxyContext
) => string | Promise<string>

export interface ProxyDefinition {
  readonly resolvePublicPath?: ProxyRouteHandler
}

export type ProxyHandler = ProxyDefinition | ProxyRouteHandler

export interface ProxyModule {
  readonly default: ProxyHandler
  readonly config?: ProxyModuleConfig
}

export interface ValidatePublicPathOptions {
  readonly aindexPublicDir: string
}
