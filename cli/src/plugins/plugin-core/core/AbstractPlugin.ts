import type {ILogger} from '@truenine/logger'
import type {PluginKind} from '../types/enums'
import type {Plugin} from '../types/plugin'

import {createLogger} from '@truenine/logger'

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
