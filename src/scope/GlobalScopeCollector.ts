// src/scope/GlobalScopeCollector.ts
// Collects and manages global scope variables for MDX expression evaluation.

import type { EnvironmentContext, MdxGlobalScope, OsInfo, ToolReferences, UserProfile } from '@/globals'
import type { UserConfigFile } from '@/types/ConfigTypes'
import * as os from 'node:os'
import process from 'node:process'
import { ShellKind } from '@/globals'

/**
 * Options for GlobalScopeCollector
 */
export interface GlobalScopeCollectorOptions {
  /** User configuration file */
  readonly userConfig?: UserConfigFile | undefined
}

/**
 * Collects global scope variables from system, environment, and user configuration.
 * The collected scope is available in MDX templates via expressions like {os.platform}, {env.NODE_ENV}, etc.
 */
export class GlobalScopeCollector {
  private readonly userConfig: UserConfigFile | undefined

  constructor(options: GlobalScopeCollectorOptions = {}) {
    this.userConfig = options.userConfig
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
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      homedir: os.homedir(),
      tmpdir: os.tmpdir(),
      type: os.type(),
      release: os.release(),
      shellKind: this.detectShellKind(),
    }
  }

  /**
   * Detect the current shell type from environment variables
   */
  private detectShellKind(): ShellKind {
    const shell = process.env['SHELL'] ?? process.env['ComSpec'] ?? ''
    const shellLower = shell.toLowerCase()

    if (shellLower.includes('bash')) {
      return ShellKind.Bash
    }
    if (shellLower.includes('zsh')) {
      return ShellKind.Zsh
    }
    if (shellLower.includes('fish')) {
      return ShellKind.Fish
    }
    if (shellLower.includes('pwsh')) {
      return ShellKind.Pwsh
    }
    if (shellLower.includes('powershell')) {
      return ShellKind.PowerShell
    }
    if (shellLower.includes('cmd')) {
      return ShellKind.Cmd
    }
    if (shellLower.endsWith('/sh')) {
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
    return this.userConfig?.profile ?? {}
  }

  /**
   * Collect tool references with system defaults
   * Tool references are system-defined and not user-configurable.
   * Output plugins may override these values for specific AI tools.
   */
  private collectToolReferences(): ToolReferences {
    return {
      websearch: 'web_search',
      webfetch: 'web_fetch',
    }
  }
}
