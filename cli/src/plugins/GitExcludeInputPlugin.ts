import type {CollectedInputContext} from '@/types'
import * as path from 'node:path'
import {BaseFileInputPlugin} from './BaseFileInputPlugin'

/**
 * Input plugin that reads git exclude patterns from shadow source project.
 * Reads from `public/exclude` file in the shadow project directory.
 *
 * This content will be merged with existing `.git/info/exclude` by GitExcludeOutputPlugin.
 */
export class GitExcludeInputPlugin extends BaseFileInputPlugin {
  constructor() {
    super('GitExcludeInputPlugin')
  }

  protected getFilePath(shadowProjectDir: string): string {
    return path.join(shadowProjectDir, 'public', 'exclude')
  }

  protected getResultKey(): keyof CollectedInputContext {
    return 'shadowGitExclude'
  }
}
