import type {InputCapabilityContext} from '../plugins/plugin-core'
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
import {EditorConfigInputCapability} from './input-editorconfig'
import {GitExcludeInputCapability} from './input-git-exclude'
import {GitIgnoreInputCapability} from './input-gitignore'
import {JetBrainsConfigInputCapability} from './input-jetbrains-config'
import {AIAgentIgnoreInputCapability} from './input-shared-ignore'
import {VSCodeConfigInputCapability} from './input-vscode-config'
import {ZedConfigInputCapability} from './input-zed-config'

interface TestContextOptions {
  readonly aindexDir?: string
  readonly runtimeCommand?: InputCapabilityContext['runtimeCommand']
}

function createContext(
  tempWorkspace: string,
  options?: TestContextOptions
): InputCapabilityContext {
  const mergedOptions = mergeConfig({
    workspaceDir: tempWorkspace,
    ...(options?.aindexDir != null
      ? {
          aindex: {
            dir: options.aindexDir
          }
        }
      : {})
  })

  return {
    logger: createLogger('PublicConfigInputCapabilityTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: mergedOptions,
    dependencyContext: {},
    ...(options?.runtimeCommand != null
      ? {runtimeCommand: options.runtimeCommand}
      : {})
  } as InputCapabilityContext
}

function writePublicDefinition(
  tempWorkspace: string,
  targetRelativePath: string,
  content: string
): string {
  const filePath = resolvePublicDefinitionPath(
    path.join(tempWorkspace, 'aindex'),
    targetRelativePath
  )
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
}

function writePublicProxy(tempWorkspace: string, source: string): string {
  return writePublicDefinition(tempWorkspace, 'proxy.ts', source)
}

describe('public config input plugins', () => {
  it('reads config definitions from target-relative public paths', () => {
    const tempWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tnmsc-public-config-input-')
    )

    try {
      const aindexDir = path.join(tempWorkspace, 'aindex')
      const gitIgnorePath = writePublicDefinition(
        tempWorkspace,
        PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH,
        'dist/\n'
      )
      const gitExcludePath = writePublicDefinition(
        tempWorkspace,
        PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH,
        '.idea/\n'
      )
      const editorConfigPath = writePublicDefinition(
        tempWorkspace,
        '.editorconfig',
        'root = true\n'
      )
      writePublicDefinition(
        tempWorkspace,
        '.vscode/settings.json',
        '{"editor.tabSize": 2}\n'
      )
      writePublicDefinition(
        tempWorkspace,
        '.vscode/extensions.json',
        '{"recommendations":["foo.bar"]}\n'
      )
      writePublicDefinition(
        tempWorkspace,
        '.zed/settings.json',
        '{"tab_size": 2}\n'
      )
      writePublicDefinition(
        tempWorkspace,
        '.idea/.gitignore',
        '/workspace.xml\n'
      )
      writePublicDefinition(
        tempWorkspace,
        '.idea/codeStyles/Project.xml',
        '<project />\n'
      )
      writePublicDefinition(
        tempWorkspace,
        '.idea/codeStyles/codeStyleConfig.xml',
        '<component />\n'
      )

      for (const fileName of AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS)
      { writePublicDefinition(tempWorkspace, fileName, `${fileName}\n`) }

      const ctx = createContext(tempWorkspace)
      const gitIgnore = new GitIgnoreInputCapability().collect(ctx)
      const gitExclude = new GitExcludeInputCapability().collect(ctx)
      const editorConfig = new EditorConfigInputCapability().collect(ctx)
      const vscode = new VSCodeConfigInputCapability().collect(ctx)
      const zed = new ZedConfigInputCapability().collect(ctx)
      const jetbrains = new JetBrainsConfigInputCapability().collect(ctx)
      const ignoreFiles = new AIAgentIgnoreInputCapability().collect(ctx)

      expect(gitIgnore.globalGitIgnore).toBe('dist/\n')
      expect(gitExclude.shadowGitExclude).toBe('.idea/\n')
      expect(editorConfig.editorConfigFiles?.[0]?.dir.path).toBe(
        editorConfigPath
      )
      expect(vscode.vscodeConfigFiles?.map(file => file.dir.path)).toEqual([
        path.join(aindexDir, 'public', '.vscode', 'settings.json'),
        path.join(aindexDir, 'public', '.vscode', 'extensions.json')
      ])
      expect(zed.zedConfigFiles?.map(file => file.dir.path)).toEqual([
        path.join(aindexDir, 'public', '.zed', 'settings.json')
      ])
      expect(
        jetbrains.jetbrainsConfigFiles?.map(file => file.dir.path)
      ).toEqual([
        path.join(aindexDir, 'public', '.idea', 'codeStyles', 'Project.xml'),
        path.join(
          aindexDir,
          'public',
          '.idea',
          'codeStyles',
          'codeStyleConfig.xml'
        ),
        path.join(aindexDir, 'public', '.idea', '.gitignore')
      ])
      expect(
        ignoreFiles.aiAgentIgnoreConfigFiles?.map(file => file.fileName)
      ).toEqual([...AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS])
      expect(
        ignoreFiles.aiAgentIgnoreConfigFiles?.map(file => file.sourcePath)
      ).toEqual(
        AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS.map(fileName =>
          resolvePublicDefinitionPath(aindexDir, fileName))
      )
      expect(gitIgnorePath).toBe(path.join(aindexDir, 'public', '.gitignore'))
      expect(gitExcludePath).toBe(
        path.join(aindexDir, 'public', '.git', 'info', 'exclude')
      )
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('does not read legacy definition locations after the hard cut', () => {
    const tempWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tnmsc-public-config-legacy-')
    )

    try {
      const aindexDir = path.join(tempWorkspace, 'aindex')
      fs.mkdirSync(path.join(aindexDir, 'public'), {recursive: true})
      fs.mkdirSync(path.join(aindexDir, '.vscode'), {recursive: true})
      fs.mkdirSync(path.join(aindexDir, '.zed'), {recursive: true})
      fs.mkdirSync(path.join(aindexDir, '.idea', 'codeStyles'), {
        recursive: true
      })

      fs.writeFileSync(
        path.join(aindexDir, 'public', 'gitignore'),
        'legacy gitignore\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, 'public', 'exclude'),
        'legacy exclude\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, '.editorconfig'),
        'root = true\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, '.vscode', 'settings.json'),
        '{}\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, '.vscode', 'extensions.json'),
        '{}\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, '.zed', 'settings.json'),
        '{}\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, '.idea', '.gitignore'),
        '/workspace.xml\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, '.idea', 'codeStyles', 'Project.xml'),
        '<project />\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, '.idea', 'codeStyles', 'codeStyleConfig.xml'),
        '<component />\n',
        'utf8'
      )
      fs.writeFileSync(
        path.join(aindexDir, '.cursorignore'),
        '.cursor/\n',
        'utf8'
      )

      const ctx = createContext(tempWorkspace)

      expect(
        new GitIgnoreInputCapability().collect(ctx).globalGitIgnore
      ).toBeUndefined()
      expect(
        new GitExcludeInputCapability().collect(ctx).shadowGitExclude
      ).toBeUndefined()
      expect(
        new EditorConfigInputCapability().collect(ctx).editorConfigFiles ?? []
      ).toHaveLength(0)
      expect(
        new VSCodeConfigInputCapability().collect(ctx).vscodeConfigFiles ?? []
      ).toHaveLength(0)
      expect(
        new ZedConfigInputCapability().collect(ctx).zedConfigFiles ?? []
      ).toHaveLength(0)
      expect(
        new JetBrainsConfigInputCapability().collect(ctx).jetbrainsConfigFiles ?? []
      ).toHaveLength(0)
      expect(
        new AIAgentIgnoreInputCapability().collect(ctx).aiAgentIgnoreConfigFiles ?? []
      ).toHaveLength(0)
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('routes public definitions through public/proxy.ts transparently', () => {
    const tempWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tnmsc-public-config-proxy-')
    )

    try {
      const aindexDir = path.join(tempWorkspace, 'aindex')
      writePublicProxy(
        tempWorkspace,
        [
          'export default (logicalPath) => {',
          '  const normalizedPath = logicalPath.replaceAll("\\\\", "/")',
          '  if (normalizedPath.startsWith(".git/")) return normalizedPath.replace(/^\\.git\\//, "____.git/")',
          '  if (normalizedPath === ".idea/.gitignore") return ".idea/.gitignore"',
          '  if (normalizedPath.startsWith(".idea/")) return normalizedPath',
          '  if (!normalizedPath.startsWith(".")) return normalizedPath',
          '  return normalizedPath.replace(/^\\.([^/\\\\]+)/, "____$1")',
          '}',
          ''
        ].join('\n')
      )

      const gitIgnorePath = writePublicDefinition(
        tempWorkspace,
        PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH,
        'dist/\n'
      )
      const gitExcludePath = writePublicDefinition(
        tempWorkspace,
        PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH,
        '.idea/\n'
      )
      const editorConfigPath = writePublicDefinition(
        tempWorkspace,
        '.editorconfig',
        'root = true\n'
      )
      const vscodeSettingsPath = writePublicDefinition(
        tempWorkspace,
        '.vscode/settings.json',
        '{"editor.tabSize": 2}\n'
      )
      const vscodeExtensionsPath = writePublicDefinition(
        tempWorkspace,
        '.vscode/extensions.json',
        '{"recommendations":["foo.bar"]}\n'
      )
      const zedSettingsPath = writePublicDefinition(
        tempWorkspace,
        '.zed/settings.json',
        '{"tab_size": 2}\n'
      )
      const ideaGitIgnorePath = writePublicDefinition(
        tempWorkspace,
        '.idea/.gitignore',
        '/workspace.xml\n'
      )
      const ideaProjectPath = writePublicDefinition(
        tempWorkspace,
        '.idea/codeStyles/Project.xml',
        '<project />\n'
      )
      const ideaCodeStyleConfigPath = writePublicDefinition(
        tempWorkspace,
        '.idea/codeStyles/codeStyleConfig.xml',
        '<component />\n'
      )

      for (const fileName of AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS)
      { writePublicDefinition(tempWorkspace, fileName, `${fileName}\n`) }

      const ctx = createContext(tempWorkspace)
      const gitIgnore = new GitIgnoreInputCapability().collect(ctx)
      const gitExclude = new GitExcludeInputCapability().collect(ctx)
      const editorConfig = new EditorConfigInputCapability().collect(ctx)
      const vscode = new VSCodeConfigInputCapability().collect(ctx)
      const zed = new ZedConfigInputCapability().collect(ctx)
      const jetbrains = new JetBrainsConfigInputCapability().collect(ctx)
      const ignoreFiles = new AIAgentIgnoreInputCapability().collect(ctx)

      expect(gitIgnore.globalGitIgnore).toBe('dist/\n')
      expect(gitExclude.shadowGitExclude).toBe('.idea/\n')
      expect(editorConfig.editorConfigFiles?.[0]?.dir.path).toBe(
        editorConfigPath
      )
      expect(vscode.vscodeConfigFiles?.map(file => file.dir.path)).toEqual([
        vscodeSettingsPath,
        vscodeExtensionsPath
      ])
      expect(zed.zedConfigFiles?.map(file => file.dir.path)).toEqual([
        zedSettingsPath
      ])
      expect(
        jetbrains.jetbrainsConfigFiles?.map(file => file.dir.path)
      ).toEqual([ideaProjectPath, ideaCodeStyleConfigPath, ideaGitIgnorePath])
      expect(
        ignoreFiles.aiAgentIgnoreConfigFiles?.map(file => file.sourcePath)
      ).toEqual(
        AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS.map(fileName =>
          resolvePublicDefinitionPath(aindexDir, fileName))
      )
      expect(gitIgnorePath).toBe(
        path.join(aindexDir, 'public', '____gitignore')
      )
      expect(gitExcludePath).toBe(
        path.join(aindexDir, 'public', '____.git', 'info', 'exclude')
      )
      expect(editorConfigPath).toBe(
        path.join(aindexDir, 'public', '____editorconfig')
      )
      expect(vscodeSettingsPath).toBe(
        path.join(aindexDir, 'public', '____vscode', 'settings.json')
      )
      expect(vscodeExtensionsPath).toBe(
        path.join(aindexDir, 'public', '____vscode', 'extensions.json')
      )
      expect(zedSettingsPath).toBe(
        path.join(aindexDir, 'public', '____zed', 'settings.json')
      )
      expect(ideaGitIgnorePath).toBe(
        path.join(aindexDir, 'public', '.idea', '.gitignore')
      )
      expect(ideaProjectPath).toBe(
        path.join(aindexDir, 'public', '.idea', 'codeStyles', 'Project.xml')
      )
      expect(ideaCodeStyleConfigPath).toBe(
        path.join(
          aindexDir,
          'public',
          '.idea',
          'codeStyles',
          'codeStyleConfig.xml'
        )
      )
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('passes the configured workspace root into public/proxy.ts', () => {
    const tempWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tnmsc-public-config-nested-aindex-')
    )

    try {
      const aindexDir = path.join(tempWorkspace, 'config', 'aindex')
      const publicDir = path.join(aindexDir, 'public')
      fs.mkdirSync(path.join(publicDir, 'expected'), {recursive: true})
      fs.writeFileSync(
        path.join(publicDir, 'proxy.ts'),
        [
          'export default (_logicalPath, ctx) => {',
          `  return ctx.workspaceDir === ${JSON.stringify(tempWorkspace)} && ctx.cwd === ${JSON.stringify(tempWorkspace)}`,
          '    ? "expected/.gitignore"',
          '    : "unexpected/.gitignore"',
          '}',
          ''
        ].join('\n'),
        'utf8'
      )
      fs.writeFileSync(
        path.join(publicDir, 'expected', '.gitignore'),
        'dist/\n',
        'utf8'
      )

      const ctx = createContext(tempWorkspace, {aindexDir: 'config/aindex'})
      const gitIgnore = new GitIgnoreInputCapability().collect(ctx)

      expect(gitIgnore.globalGitIgnore).toBe('dist/\n')
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
