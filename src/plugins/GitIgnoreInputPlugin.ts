import type {CollectedInputContext, InputPluginContext} from '@/types'
import * as path from 'node:path'
import process from 'node:process'
import {AbstractInputPlugin} from './AbstractInputPlugin'

export class GitIgnoreInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GitIgnoreInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {fs} = ctx // In prod (dist/plugins): ../../public/gitignore (assuming public is copied to dist or root) // Actually, usually assets are in the package root. // In dev (src/plugins): ../../public/gitignore // Try to locate public/gitignore relative to the current file // Let's try to find it relative to process.cwd() first if we assume we are running within the repo during dev, // but for a CLI tool, we should find it relative to __dirname. // BUT the user said "current project", which is the CLI repo. // If installed as a package, `public` might not be at `process.cwd()`. // Let's assume standard node structure for now or use process.cwd() if it is intended to be the config repo. // However, __dirname in ESM/bundled env might be tricky. // Let's try to find it relative to the module resolution. // For now, I will assume it's in the project root where the CLI code resides.

    let gitIgnorePath = path.resolve(__dirname, '../../public/gitignore')

    if (!fs.existsSync(gitIgnorePath)) { // Fallback specific for development environment if needed
      gitIgnorePath = path.resolve(process.cwd(), 'public/gitignore') // Try looking up from process.cwd temporarily if we are developing locally
    }

    if (fs.existsSync(gitIgnorePath)) {
      this.log.debug({action: 'collect', path: gitIgnorePath, message: 'Found public/gitignore'})
      const content = fs.readFileSync(gitIgnorePath, 'utf8')
      return {
        globalGitIgnore: content,
      }
    }
    this.log.warn({action: 'collect', path: gitIgnorePath, message: 'public/gitignore not found'})
    return {}
  }
}
