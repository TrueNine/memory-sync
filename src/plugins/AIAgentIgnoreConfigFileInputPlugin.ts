import type {
  AIAgentIgnoreConfigFile,
  CollectedInputContext,
  InputPluginContext,
} from '@/types'

import { DEFAULT_SHADOW_SOURCE_PROJECT_DIR } from '@/constants'
import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Ignore file names to read from shadow project
 */
const IGNORE_FILE_NAMES = ['.qoderignore', '.cursorignore', '.warpindexignore'] as const

export class AIAgentIgnoreConfigFileInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('AIAgentIgnoreConfigFileInputPlugin', ['FileSystemShadowProjectPlugin'])
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger, fs, path, dependencyContext } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const shadowSourceProjectDirRaw = options.shadowSourceProjectDir ?? DEFAULT_SHADOW_SOURCE_PROJECT_DIR
    const shadowSourceProjectDir = this.resolvePath(shadowSourceProjectDirRaw, workspaceDir, shadowProjectDir)

    const ignoreFiles: AIAgentIgnoreConfigFile[] = []

    // Get projects from dependency context (provided by FileSystemShadowProjectPlugin)
    const dependencyWorkspace = dependencyContext.workspace
    if (dependencyWorkspace == null) {
      logger.debug('No workspace found in dependency context, skipping ignore file collection')
      return { aiAgentIgnoreConfigFiles: ignoreFiles }
    }

    const projects = dependencyWorkspace.projects ?? []

    // Try to read ignore files from each project's dist directory
    for (const project of projects) {
      const projectName = project.name
      if (projectName == null) {
        continue
      }

      // Read from shadow source dist directory: ref/<project>/dist/
      const projectDistPath = path.join(shadowSourceProjectDir, projectName, 'dist')

      for (const fileName of IGNORE_FILE_NAMES) {
        const filePath = path.join(projectDistPath, fileName)

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            ignoreFiles.push({ fileName, content })
            logger.debug(`Read ignore file: ${filePath}`)
          } catch (e) {
            logger.warn(`Failed to read ignore file ${filePath}`, { error: e })
          }
        }
      }
    }

    return {
      aiAgentIgnoreConfigFiles: ignoreFiles,
    }
  }
}
