import type {ParsedMarkdown} from '@truenine/md-compiler/markdown'
import type {
  CollectedInputContext,
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
} from '@/types'

import {spawn} from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {PathPlaceholders} from '@/constants'
import {PluginKind} from '@/types'
import {AbstractPlugin} from './AbstractPlugin'

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

    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(ctx.userConfigOptions)

    const effectCtx: InputEffectContext = {
      logger: this.log,
      fs: ctx.fs,
      path: ctx.path,
      glob: ctx.glob,
      spawn,
      userConfigOptions: ctx.userConfigOptions,
      workspaceDir,
      shadowProjectDir,
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
          const errorMsg = result.error instanceof Error ? result.error.message : String(result.error)
          this.log.error({action: 'inputEffect', name: effect.name, status: 'failed', error: errorMsg})
        }
        results.push(result)
      }
      catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'inputEffect', name: effect.name, status: 'failed', error: errorMsg})
        results.push({success: false, error: error as Error, description: `Input effect failed: ${effect.name}`})
      }
    }

    return results
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

  abstract collect(ctx: InputPluginContext): Partial<CollectedInputContext> | Promise<Partial<CollectedInputContext>>

  protected resolveBasePaths(options: Required<PluginOptions>): ResolvedBasePaths {
    const workspaceDirRaw = options.workspaceDir
    const workspaceDir = this.resolvePath(workspaceDirRaw, '')

    const shadowProjectName = options.shadowSourceProject.name
    const shadowProjectDir = path.join(workspaceDir, shadowProjectName)

    return {workspaceDir, shadowProjectDir}
  }

  protected resolvePath(rawPath: string, workspaceDir: string): string {
    let resolved = rawPath

    if (resolved.startsWith(PathPlaceholders.USER_HOME)) resolved = resolved.replace(PathPlaceholders.USER_HOME, os.homedir())

    if (resolved.includes(PathPlaceholders.WORKSPACE)) resolved = resolved.replace(PathPlaceholders.WORKSPACE, workspaceDir)

    return path.normalize(resolved)
  }

  protected resolveShadowPath(relativePath: string, shadowProjectDir: string): string {
    return path.join(shadowProjectDir, relativePath)
  }

  protected readAndParseMarkdown<T extends YAMLFrontMatter>(
    filePath: string,
    fs: typeof import('node:fs')
  ): ParsedMarkdown<T> {
    const rawContent = fs.readFileSync(filePath, 'utf8')
    return parseMarkdown<T>(rawContent)
  }
}
