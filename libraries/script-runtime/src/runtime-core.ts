import type {Jiti} from 'jiti'
import type {ProxyContext, ProxyDefinition, ProxyModule, ProxyRouteHandler} from './types'

import * as fs from 'node:fs'
import * as path from 'node:path'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value) as object | null
  return prototype === Object.prototype || prototype === null
}

async function createRuntime(): Promise<Jiti> {
  const {createJiti} = await import('jiti') as {
    createJiti: (filename: string, options: {
      readonly fsCache: boolean
      readonly moduleCache: boolean
      readonly interopDefault: false
    }) => Jiti
  }

  return createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
    interopDefault: false
  })
}

function toProxyModule(rawModule: unknown): ProxyModule {
  if (!isRecord(rawModule)) throw new Error('proxy.ts must export a module namespace object')

  const defaultExport = rawModule['default']
  if (defaultExport == null) throw new Error('proxy.ts must export a default value')
  if (typeof defaultExport !== 'function' && !isPlainObject(defaultExport)) throw new TypeError('proxy.ts default export must be a function or plain object')

  const configExport = rawModule['config']
  if (configExport != null && !isPlainObject(configExport)) throw new Error('proxy.ts config export must be a plain object')

  const proxyModule: ProxyModule = {
    default: defaultExport as ProxyModule['default']
  }

  if (configExport != null) {
    return {
      ...proxyModule,
      config: configExport as NonNullable<ProxyModule['config']>
    }
  }

  return proxyModule
}

export async function loadProxyModule(filePath: string): Promise<ProxyModule> {
  const absoluteFilePath = path.resolve(filePath)
  if (!fs.existsSync(absoluteFilePath)) throw new Error(`proxy.ts not found: ${absoluteFilePath}`)

  const runtime = await createRuntime()
  const loadedModule = await runtime.import(absoluteFilePath)
  return toProxyModule(loadedModule)
}

function matchesCommand(module: ProxyModule, command: ProxyContext['command']): boolean {
  const commands = module.config?.matcher?.commands
  if (commands == null || commands.length === 0) return true
  return commands.includes(command)
}

function assertNonEmptyPath(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} cannot be empty`)
  return value
}

function getRouteHandler(handler: ProxyModule['default']): ProxyRouteHandler | undefined {
  if (typeof handler === 'function') return handler

  const proxyDefinition: ProxyDefinition = handler
  if (proxyDefinition.resolvePublicPath == null) return void 0
  if (typeof proxyDefinition.resolvePublicPath !== 'function') throw new TypeError('proxy.ts default export resolvePublicPath must be a function')

  return proxyDefinition.resolvePublicPath
}

export async function resolvePublicPathModule(
  filePath: string,
  ctx: ProxyContext,
  logicalPath: string
): Promise<string> {
  const targetLogicalPath = assertNonEmptyPath(logicalPath, 'logical public path')
  const proxyModule = await loadProxyModule(filePath)

  if (!matchesCommand(proxyModule, ctx.command)) return targetLogicalPath

  const routeHandler = getRouteHandler(proxyModule.default)
  if (routeHandler == null) return targetLogicalPath

  const resolvedPath = await routeHandler(targetLogicalPath, ctx)
  if (typeof resolvedPath !== 'string') throw new Error('proxy.ts must resolve public paths to a string')

  return assertNonEmptyPath(resolvedPath, 'proxy.ts resolved public path')
}
