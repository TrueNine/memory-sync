import type {ParsedMarkdown} from '@truenine/md-compiler/markdown'
import type {
  InputCapability,
  InputCapabilityContext,
  InputCollectedContext,
  InputEffectContext,
  InputEffectHandler,
  InputEffectRegistration,
  InputEffectResult,
  PluginOptions,
  PluginScopeRegistration,
  ResolvedBasePaths,
  YAMLFrontMatter
} from '@/plugins/plugin-core'

import {spawn} from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import {createLogger} from '@truenine/logger'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {buildDiagnostic, diagnosticLines} from '@/diagnostics'
import {PathPlaceholders} from '@/plugins/plugin-core'
import {logProtectedDeletionGuardError, ProtectedDeletionGuardError} from '@/ProtectedDeletionGuard'

export abstract class AbstractInputCapability implements InputCapability {
  private readonly inputEffects: InputEffectRegistration[] = []

  private readonly registeredScopes: PluginScopeRegistration[] = []

  readonly name: string

  readonly dependsOn?: readonly string[]

  private _log?: import('@truenine/logger').ILogger

  get log(): import('@truenine/logger').ILogger {
    this._log ??= createLogger(this.name)
    return this._log
  }

  protected constructor(name: string, dependsOn?: readonly string[]) {
    this.name = name
    if (dependsOn != null) this.dependsOn = dependsOn
  }

  protected registerEffect(name: string, handler: InputEffectHandler, priority: number = 0): void {
    this.inputEffects.push({name, handler, priority})
    this.inputEffects.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)) // Sort by priority (lower = earlier)
  }

  async executeEffects(ctx: InputCapabilityContext, dryRun: boolean = false): Promise<InputEffectResult[]> {
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

    this.log.error(buildDiagnostic({
      code: 'INPUT_EFFECT_FAILED',
      title: `Input effect failed: ${effectName}`,
      rootCause: diagnosticLines(
        `The input effect "${effectName}" failed before tnmsc could finish preprocessing.`,
        `Underlying error: ${error.message}`
      ),
      exactFix: diagnosticLines(
        'Inspect the effect inputs and fix the failing file, path, or environment condition before retrying tnmsc.'
      ),
      possibleFixes: [
        diagnosticLines('Re-run the command after fixing the referenced path or generated artifact.'),
        diagnosticLines('Add a focused regression test if this effect should handle the failure more gracefully.')
      ],
      details: {
        effectName,
        errorMessage: error.message
      }
    }))
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

  abstract collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> | Promise<Partial<InputCollectedContext>>

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
