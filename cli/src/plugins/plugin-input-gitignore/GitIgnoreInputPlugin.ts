import type {CollectedInputContext} from '@truenine/plugin-shared'
import * as path from 'node:path'
import {BaseFileInputPlugin} from '@truenine/plugin-input-shared'

/**
 * Input plugin that reads gitignore content from shadow source project.
 */
export class GitIgnoreInputPlugin extends BaseFileInputPlugin {
  constructor() {
    super('GitIgnoreInputPlugin')
  }

  protected getFilePath(shadowProjectDir: string): string {
    return path.join(shadowProjectDir, 'public', 'gitignore')
  }

  protected getResultKey(): keyof CollectedInputContext {
    return 'globalGitIgnore'
  }
}
