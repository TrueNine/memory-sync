import type {InputPluginContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {
  AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS,
  PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH,
  PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH,
  resolvePublicDefinitionPath
} from '../public-config-paths'
import {EditorConfigInputPlugin} from './input-editorconfig'
import {GitExcludeInputPlugin} from './input-git-exclude'
import {GitIgnoreInputPlugin} from './input-gitignore'
import {JetBrainsConfigInputPlugin} from './input-jetbrains-config'
import {AIAgentIgnoreInputPlugin} from './input-shared-ignore'
import {VSCodeConfigInputPlugin} from './input-vscode-config'

function createContext(tempWorkspace: string): InputPluginContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('PublicConfigInputPluginTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputPluginContext
}

function writePublicDefinition(tempWorkspace: string, targetRelativePath: string, content: string): string {
  const filePath = resolvePublicDefinitionPath(path.join(tempWorkspace, 'aindex'), targetRelativePath)
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
}

describe('public config input plugins', () => {
  it('reads config definitions from target-relative public paths', () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-public-config-input-'))

    try {
      const aindexDir = path.join(tempWorkspace, 'aindex')
      const gitIgnorePath = writePublicDefinition(tempWorkspace, PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH, 'dist/\n')
      const gitExcludePath = writePublicDefinition(tempWorkspace, PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH, '.idea/\n')
      const editorConfigPath = writePublicDefinition(tempWorkspace, '.editorconfig', 'root = true\n')
      writePublicDefinition(tempWorkspace, '.vscode/settings.json', '{"editor.tabSize": 2}\n')
      writePublicDefinition(tempWorkspace, '.vscode/extensions.json', '{"recommendations":["foo.bar"]}\n')
      writePublicDefinition(tempWorkspace, '.idea/.gitignore', '/workspace.xml\n')
      writePublicDefinition(tempWorkspace, '.idea/codeStyles/Project.xml', '<project />\n')
      writePublicDefinition(tempWorkspace, '.idea/codeStyles/codeStyleConfig.xml', '<component />\n')

      for (const fileName of AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS) writePublicDefinition(tempWorkspace, fileName, `${fileName}\n`)

      const ctx = createContext(tempWorkspace)
      const gitIgnore = new GitIgnoreInputPlugin().collect(ctx)
      const gitExclude = new GitExcludeInputPlugin().collect(ctx)
      const editorConfig = new EditorConfigInputPlugin().collect(ctx)
      const vscode = new VSCodeConfigInputPlugin().collect(ctx)
      const jetbrains = new JetBrainsConfigInputPlugin().collect(ctx)
      const ignoreFiles = new AIAgentIgnoreInputPlugin().collect(ctx)

      expect(gitIgnore.globalGitIgnore).toBe('dist/\n')
      expect(gitExclude.shadowGitExclude).toBe('.idea/\n')
      expect(editorConfig.editorConfigFiles?.[0]?.dir.path).toBe(editorConfigPath)
      expect(vscode.vscodeConfigFiles?.map(file => file.dir.path)).toEqual([
        path.join(aindexDir, 'public', '.vscode', 'settings.json'),
        path.join(aindexDir, 'public', '.vscode', 'extensions.json')
      ])
      expect(jetbrains.jetbrainsConfigFiles?.map(file => file.dir.path)).toEqual([
        path.join(aindexDir, 'public', '.idea', 'codeStyles', 'Project.xml'),
        path.join(aindexDir, 'public', '.idea', 'codeStyles', 'codeStyleConfig.xml'),
        path.join(aindexDir, 'public', '.idea', '.gitignore')
      ])
      expect(ignoreFiles.aiAgentIgnoreConfigFiles?.map(file => file.fileName)).toEqual([
        ...AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS
      ])
      expect(ignoreFiles.aiAgentIgnoreConfigFiles?.map(file => file.sourcePath)).toEqual(
        AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS.map(fileName => resolvePublicDefinitionPath(aindexDir, fileName))
      )
      expect(gitIgnorePath).toBe(path.join(aindexDir, 'public', '.gitignore'))
      expect(gitExcludePath).toBe(path.join(aindexDir, 'public', '.git', 'info', 'exclude'))
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('does not read legacy definition locations after the hard cut', () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-public-config-legacy-'))

    try {
      const aindexDir = path.join(tempWorkspace, 'aindex')
      fs.mkdirSync(path.join(aindexDir, 'public'), {recursive: true})
      fs.mkdirSync(path.join(aindexDir, '.vscode'), {recursive: true})
      fs.mkdirSync(path.join(aindexDir, '.idea', 'codeStyles'), {recursive: true})

      fs.writeFileSync(path.join(aindexDir, 'public', 'gitignore'), 'legacy gitignore\n', 'utf8')
      fs.writeFileSync(path.join(aindexDir, 'public', 'exclude'), 'legacy exclude\n', 'utf8')
      fs.writeFileSync(path.join(aindexDir, '.editorconfig'), 'root = true\n', 'utf8')
      fs.writeFileSync(path.join(aindexDir, '.vscode', 'settings.json'), '{}\n', 'utf8')
      fs.writeFileSync(path.join(aindexDir, '.vscode', 'extensions.json'), '{}\n', 'utf8')
      fs.writeFileSync(path.join(aindexDir, '.idea', '.gitignore'), '/workspace.xml\n', 'utf8')
      fs.writeFileSync(path.join(aindexDir, '.idea', 'codeStyles', 'Project.xml'), '<project />\n', 'utf8')
      fs.writeFileSync(path.join(aindexDir, '.idea', 'codeStyles', 'codeStyleConfig.xml'), '<component />\n', 'utf8')
      fs.writeFileSync(path.join(aindexDir, '.cursorignore'), '.cursor/\n', 'utf8')

      const ctx = createContext(tempWorkspace)

      expect(new GitIgnoreInputPlugin().collect(ctx).globalGitIgnore).toBeUndefined()
      expect(new GitExcludeInputPlugin().collect(ctx).shadowGitExclude).toBeUndefined()
      expect(new EditorConfigInputPlugin().collect(ctx).editorConfigFiles ?? []).toHaveLength(0)
      expect(new VSCodeConfigInputPlugin().collect(ctx).vscodeConfigFiles ?? []).toHaveLength(0)
      expect(new JetBrainsConfigInputPlugin().collect(ctx).jetbrainsConfigFiles ?? []).toHaveLength(0)
      expect(new AIAgentIgnoreInputPlugin().collect(ctx).aiAgentIgnoreConfigFiles ?? []).toHaveLength(0)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
