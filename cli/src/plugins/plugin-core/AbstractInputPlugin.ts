import type {ParsedMarkdown} from '@truenine/md-compiler/markdown'
import type {
  InputCollectedContext,
  InputEffectContext,
  InputEffectHandler,
  InputEffectRegistration,
  InputEffectResult,
  InputPlugin,
  InputPluginContext,
  PluginOptions,
  PluginScopeRegistration,
  ResolvedBasePaths,
  YAMLFrontMatter
} from './types'

import {spawn} from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {logProtectedDeletionGuardError, ProtectedDeletionGuardError} from '@/ProtectedDeletionGuard'
import {AbstractPlugin} from './AbstractPlugin'
import {PathPlaceholders} from './constants'
import {PluginKind} from './enums'

export abstract class AbstractInputPlugin extends AbstractPlugin<PluginKind.Input> implements InputPlugin {
  private readonly inputEffects: InputEffectRegistration[] = []

  private readonly registeredScopes: PluginScopeRegistration[] = []

  protected constructor(name: string, dependsOn?: readonly string[]) {
    super(name, PluginKind.Input, dependsOn)
  }

  protected registerEffect(name: string, handler: InputEffectHandler, priority: number = 0): void {
    this.inputEffects.push({name, handler, priority})
    this.inputEffects.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)) // Sort by priority (lower = earlier)
  }

  async executeEffects(ctx: InputPluginContext, dryRun: boolean = false): Promise<InputEffectResult[]> {
    const results: InputEffectResult[] = []

    if (this.inputEffects.length === 0) return results

    const {workspaceDir, aindexDir} = this.resolveBasePaths(ctx.userConfigOptions)

    const effectCtx: InputEffectContext = {
      logger: this.log,
      fs: ctx.fs,
      path: ctx.path,
      glob: ctx.glob,
      spawn,
      userConfigOptions: ctx.userConfigOptions,
      workspaceDir,
      aindexDir,
      dryRun
    }

    for (const effect of this.inputEffects) {
      if (dryRun) {
        this.log.trace({action: 'dryRun', type: 'inputEffect', name: effect.name})
        results.push({success: true, description: `Would execute input effect: ${effect.name}`})
        continue
      }

      try {
        const result = await effect.handler(effectCtx)
        if (result.success) {
          this.log.trace({action: 'inputEffect', name: effect.name, status: 'success', description: result.description})
          if (result.modifiedFiles != null && result.modifiedFiles.length > 0) {
            this.log.debug({action: 'inputEffect', name: effect.name, modifiedFiles: result.modifiedFiles})
          }
          if (result.deletedFiles != null && result.deletedFiles.length > 0) {
            this.log.debug({action: 'inputEffect', name: effect.name, deletedFiles: result.deletedFiles})
          }
        } else {
          const error = result.error ?? new Error(`Input effect failed: ${effect.name}`)
          throw error
        }
        results.push(result)
      }
      catch (error) {
        const effectError = error instanceof Error ? error : new Error(String(error))
        this.logInputEffectFailure(effect.name, effectError)
        results.push({success: false, error: effectError, description: `Input effect failed: ${effect.name}`})
        throw effectError
      }
    }

    return results
  }

  private logInputEffectFailure(effectName: string, error: Error): void {
    if (error instanceof ProtectedDeletionGuardError) {
      logProtectedDeletionGuardError(this.log, error.operation, error.violations)
      return
    }

    this.log.error({action: 'inputEffect', name: effectName, status: 'failed', error: error.message})
  }

  hasEffects(): boolean {
    return this.inputEffects.length > 0
  }

  getEffectCount(): number {
    return this.inputEffects.length
  }

  protected registerScope(namespace: string, values: Record<string, unknown>): void {
    this.registeredScopes.push({namespace, values})
    this.log.debug({action: 'registerScope', namespace, keys: Object.keys(values)})
  }

  getRegisteredScopes(): readonly PluginScopeRegistration[] {
    return this.registeredScopes
  }

  protected clearRegisteredScopes(): void {
    this.registeredScopes.length = 0
    this.log.debug({action: 'clearRegisteredScopes'})
  }

  abstract collect(ctx: InputPluginContext): Partial<InputCollectedContext> | Promise<Partial<InputCollectedContext>>

  protected resolveBasePaths(options: Required<PluginOptions>): ResolvedBasePaths {
    const workspaceDirRaw = options.workspaceDir
    const workspaceDir = this.resolvePath(workspaceDirRaw, '')

    const aindexDirName = options.aindex?.dir ?? 'aindex' // 从配置读取 aindex 目录名，默认为 'aindex'
    const aindexDir = path.join(workspaceDir, aindexDirName)

    return {workspaceDir, aindexDir}
  }

  protected resolvePath(rawPath: string, workspaceDir: string): string {
    let resolved = rawPath

    if (resolved.startsWith(PathPlaceholders.USER_HOME)) resolved = resolved.replace(PathPlaceholders.USER_HOME, os.homedir())

    if (resolved.includes(PathPlaceholders.WORKSPACE)) resolved = resolved.replace(PathPlaceholders.WORKSPACE, workspaceDir)

    return path.normalize(resolved)
  }

  protected resolveAindexPath(relativePath: string, aindexDir: string): string {
    return path.join(aindexDir, relativePath)
  }

  protected readAndParseMarkdown<T extends YAMLFrontMatter>(
    filePath: string,
    fs: typeof import('node:fs')
  ): ParsedMarkdown<T> {
    const rawContent = fs.readFileSync(filePath, 'utf8')
    return parseMarkdown<T>(rawContent)
  }
}
