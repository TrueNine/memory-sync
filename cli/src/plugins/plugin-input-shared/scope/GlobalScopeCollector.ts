import type {EnvironmentContext, MdComponent, MdxGlobalScope, OsInfo, ToolReferences, UserProfile} from '@truenine/md-compiler/globals' // Collects and manages global scope variables for MDX expression evaluation. // src/scope/GlobalScopeCollector.ts
import type {UserConfigFile} from '../../plugin-shared'
import * as os from 'node:os'
import process from 'node:process'
import {OsKind, ShellKind, ToolPresets} from '@truenine/md-compiler/globals'

/**
 * Tool preset names supported by GlobalScopeCollector
 */
export type ToolPresetName = keyof typeof ToolPresets

/**
 * Options for GlobalScopeCollector
 */
export interface GlobalScopeCollectorOptions {
  /** User configuration file */
  readonly userConfig?: UserConfigFile | undefined
  /** Tool preset to use (default: 'default') */
  readonly toolPreset?: ToolPresetName | undefined
}

/**
 * Collects global scope variables from system, environment, and user configuration.
 * The collected scope is available in MDX templates via expressions like {os.platform}, {env.NODE_ENV}, etc.
 */
export class GlobalScopeCollector {
  private readonly userConfig: UserConfigFile | undefined
  private readonly toolPreset: ToolPresetName

  constructor(options: GlobalScopeCollectorOptions = {}) {
    this.userConfig = options.userConfig
    this.toolPreset = options.toolPreset ?? 'default'
  }

  collect(): MdxGlobalScope {
    return {
      os: this.collectOsInfo(),
      env: this.collectEnvContext(),
      profile: this.collectProfile(),
      tool: this.collectToolReferences(),
      Md: this.createMdComponent()
    }
  }

  private collectOsInfo(): OsInfo {
    const platform = os.platform()
    return {
      platform,
      arch: os.arch(),
      hostname: os.hostname(),
      homedir: os.homedir(),
      tmpdir: os.tmpdir(),
      type: os.type(),
      release: os.release(),
      shellKind: this.detectShellKind(),
      kind: this.detectOsKind(platform)
    }
  }

  private detectOsKind(platform: string): OsKind {
    switch (platform) {
      case 'win32': return OsKind.Win
      case 'darwin': return OsKind.Mac
      case 'linux':
      case 'freebsd':
      case 'openbsd':
      case 'sunos':
      case 'aix': return OsKind.Linux
      default: return OsKind.Unknown
    }
  }

  private detectShellKind(): ShellKind {
    const shell = process.env['SHELL'] ?? process.env['ComSpec'] ?? ''
    const s = shell.toLowerCase()

    if (s.includes('bash')) return ShellKind.Bash
    if (s.includes('zsh')) return ShellKind.Zsh
    if (s.includes('fish')) return ShellKind.Fish
    if (s.includes('pwsh')) return ShellKind.Pwsh
    if (s.includes('powershell')) return ShellKind.PowerShell
    if (s.includes('cmd')) return ShellKind.Cmd
    if (s.endsWith('/sh')) return ShellKind.Sh

    return ShellKind.Unknown
  }

  private collectEnvContext(): EnvironmentContext {
    return {...process.env}
  }

  private collectProfile(): UserProfile {
    if (this.userConfig?.profile != null) return this.userConfig.profile as UserProfile
    return {}
  }

  private collectToolReferences(): ToolReferences {
    const defaults: ToolReferences = {...ToolPresets.default}
    if (this.toolPreset === 'claudeCode') return {...defaults, ...ToolPresets.claudeCode}
    if (this.toolPreset === 'kiro') return {...defaults, ...ToolPresets.kiro}
    return defaults
  }

  private createMdComponent(): MdComponent {
    const mdComponent = ((props: {when?: boolean, children?: unknown}) => {
      if (props.when === false) return null
      return props.children
    }) as MdComponent

    mdComponent.Line = (props: {when?: boolean, children?: unknown}) => {
      if (props.when === false) return null
      return props.children
    }

    return mdComponent
  }
}
