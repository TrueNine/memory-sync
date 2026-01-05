// src/scope/GlobalScopeCollector.ts
// Collects and manages global scope variables for MDX expression evaluation.

import type { EnvironmentContext, MdxGlobalScope, OsInfo, ToolReferences, UserProfile } from '@/globals'
import type { UserConfigFile } from '@/types/ConfigTypes'
import * as os from 'node:os'
import process from 'node:process'
import { OsKind, ShellKind, ToolPresets } from '@/globals'

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

  /**
   * Collect the complete global scope
   * @returns MdxGlobalScope containing os, env, profile, and tool namespaces
   */
  collect(): MdxGlobalScope {
    return {
      os: this.collectOsInfo(),
      env: this.collectEnvContext(),
      profile: this.collectProfile(),
      tool: this.collectToolReferences(),
    }
  }

  /**
   * Collect operating system information
   */
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
      kind: this.detectOsKind(platform),
    }
  }

  /**
   * Detect the simplified OS kind from platform
   */
  private detectOsKind(platform: string): OsKind {
    switch (platform) {
      case 'win32':
        return OsKind.Win
      case 'darwin':
        return OsKind.Mac
      case 'linux':
      case 'freebsd':
      case 'openbsd':
      case 'sunos':
      case 'aix':
        return OsKind.Linux
      default:
        return OsKind.Unknown
    }
  }

  /**
   * Detect the current shell type from environment variables
   */
  private detectShellKind(): ShellKind {
    const shell = process.env['SHELL'] ?? process.env['ComSpec'] ?? ''
    const s = shell.toLowerCase()

    if (s.includes('bash')) {
      return ShellKind.Bash
    }
    if (s.includes('zsh')) {
      return ShellKind.Zsh
    }
    if (s.includes('fish')) {
      return ShellKind.Fish
    }
    if (s.includes('pwsh')) {
      return ShellKind.Pwsh
    }
    if (s.includes('powershell')) {
      return ShellKind.PowerShell
    }
    if (s.includes('cmd')) {
      return ShellKind.Cmd
    }
    if (s.endsWith('/sh')) {
      return ShellKind.Sh
    }

    return ShellKind.Unknown
  }

  /**
   * Collect environment variables
   */
  private collectEnvContext(): EnvironmentContext {
    return { ...process.env }
  }

  /**
   * Collect user profile from configuration
   */
  private collectProfile(): UserProfile {
    if (this.userConfig?.profile != null) {
      return this.userConfig.profile
    }
    return {}
  }

  /**
   * Collect tool references with system defaults and preset overrides.
   * Tool references are system-defined and not user-configurable.
   * Output plugins may override these values for specific AI tools via presets.
   */
  private collectToolReferences(): ToolReferences {
    const defaults: ToolReferences = { ...ToolPresets.default }
    if (this.toolPreset === 'claudeCode') {
      return { ...defaults, ...ToolPresets.claudeCode }
    }
    if (this.toolPreset === 'kiro') {
      return { ...defaults, ...ToolPresets.kiro }
    }
    return defaults
  }
}
