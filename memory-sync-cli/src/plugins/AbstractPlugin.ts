import type {ILogger} from 'memory-sync-cli/src/log'
import type {PluginKind} from 'memory-sync-cli/src/types/Enums'
import type {Plugin} from 'memory-sync-cli/src/types/PluginTypes'

import {createLogger} from 'memory-sync-cli/src/log'

export abstract class AbstractPlugin<T extends PluginKind = PluginKind> implements Plugin<T> {
  readonly type: T

  readonly name: string

  private _log?: ILogger

  get log(): ILogger {
    this._log ??= createLogger(this.name)
    return this._log
  }

  readonly dependsOn?: readonly string[]

  protected constructor(name: string, type: T, dependsOn?: readonly string[]) {
    this.name = name
    this.type = type
    if (dependsOn != null) this.dependsOn = dependsOn
  }
}
