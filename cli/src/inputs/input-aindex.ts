import type {CollectedInputContext, InputPluginContext, Project, Workspace} from '../plugins/plugin-core'
import type {ProjectConfig} from '../plugins/plugin-core'

import {AbstractInputPlugin} from '../plugins/plugin-core'
import {parse as parseJsonc} from 'jsonc-parser'
import {FilePathKind} from '../plugins/plugin-core'

export class AindexInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('AindexInputPlugin')
  }

  private loadProjectConfig(
    projectName: string,
    aindexDir: string,
    srcPath: string,
    fs: InputPluginContext['fs'],
    path: InputPluginContext['path'],
    logger: InputPluginContext['logger']
  ): ProjectConfig | undefined {
    const configPath = path.join(aindexDir, srcPath, projectName, 'project.jsonc')
    if (!fs.existsSync(configPath)) return void 0
    try {
      const raw = fs.readFileSync(configPath, 'utf8')
      const errors: import('jsonc-parser').ParseError[] = []
      const result = parseJsonc(raw, errors) as ProjectConfig
      if (errors.length > 0) {
        logger.warn(`failed to parse project.jsonc for ${projectName}`, {path: configPath, errors})
        return void 0
      }
      return result
    } catch (e) {
      logger.warn(`failed to parse project.jsonc for ${projectName}`, {path: configPath, error: e})
      return void 0
    }
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions: options, logger, fs, path} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(options)

    const aindexProjectsDir = this.resolveAindexPath(options.aindex.app.dist, aindexDir)

    const aindexName = path.basename(aindexDir)

    const aindexProjects: Project[] = []

    if (fs.existsSync(aindexProjectsDir) && fs.statSync(aindexProjectsDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(aindexProjectsDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const isTheAindex = entry.name === aindexName
            const projectConfig = this.loadProjectConfig(entry.name, aindexDir, options.aindex.app.src, fs, path, logger)

            aindexProjects.push({
              name: entry.name,
              ...isTheAindex && {isPromptSourceProject: true},
              ...projectConfig != null && {projectConfig},
              dirFromWorkspacePath: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: workspaceDir,
                getDirectoryName: () => entry.name,
                getAbsolutePath: () => path.resolve(workspaceDir, entry.name)
              }
            })
          }
        }
      }
      catch (e) {
        logger.error('failed to scan aindex projects', {path: aindexProjectsDir, error: e})
      }
    }

    if (aindexProjects.length === 0 && fs.existsSync(workspaceDir) && fs.statSync(workspaceDir).isDirectory()) {
      logger.debug('no projects in dist/app/, falling back to workspace scan', {workspaceDir})
      try {
        const entries = fs.readdirSync(workspaceDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const isTheAindex = entry.name === aindexName
            const projectConfig = this.loadProjectConfig(entry.name, aindexDir, options.aindex.app.src, fs, path, logger)

            aindexProjects.push({
              name: entry.name,
              ...isTheAindex && {isPromptSourceProject: true},
              ...projectConfig != null && {projectConfig},
              dirFromWorkspacePath: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: workspaceDir,
                getDirectoryName: () => entry.name,
                getAbsolutePath: () => path.resolve(workspaceDir, entry.name)
              }
            })
          }
        }
      }
      catch (e) {
        logger.error('failed to scan workspace directory', {path: workspaceDir, error: e})
      }
    }

    const workspace: Workspace = {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir)
      },
      projects: aindexProjects
    }

    return {workspace}
  }
}
