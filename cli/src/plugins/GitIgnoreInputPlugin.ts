import type {CollectedInputContext} from '@/types'
import * as path from 'node:path'
import {bundles} from '@truenine/init-bundle'
import {BaseFileInputPlugin} from './BaseFileInputPlugin'

type BundleMap = Readonly<Record<string, {readonly content: string}>>
const bundleMap = bundles as unknown as BundleMap

function getGitignoreTemplate(): string { // 从 bundles 获取 gitignore 模板内容（public/exclude）
  return bundleMap['public/gitignore']?.content ?? ''
}

/**
 * Input plugin that reads gitignore content from shadow source project.
 * Falls back to template from init-bundle if file doesn't exist.
 */
export class GitIgnoreInputPlugin extends BaseFileInputPlugin {
  constructor() {
    super('GitIgnoreInputPlugin', {fallbackContent: getGitignoreTemplate()})
  }

  protected getFilePath(shadowProjectDir: string): string {
    return path.join(shadowProjectDir, 'public', 'gitignore')
  }

  protected getResultKey(): keyof CollectedInputContext {
    return 'globalGitIgnore'
  }
}
