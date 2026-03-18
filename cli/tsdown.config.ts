import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {version: string, name: string}
const kiroGlobalPowersRegistry = '{"version":"1.0.0","powers":{},"repoSources":{}}'

const pluginAliases: Record<string, string> = {
  '@truenine/desk-paths': resolve('src/plugins/desk-paths.ts'),
  '@truenine/plugin-output-shared': resolve('src/plugins/plugin-output-shared/index.ts'),
  '@truenine/plugin-input-shared': resolve('src/plugins/plugin-input-shared/index.ts'),
  '@truenine/plugin-agentskills-compact': resolve('src/plugins/plugin-agentskills-compact.ts'),
  '@truenine/plugin-agentsmd': resolve('src/plugins/plugin-agentsmd.ts'),
  '@truenine/plugin-antigravity': resolve('src/plugins/plugin-antigravity/index.ts'),
  '@truenine/plugin-claude-code-cli': resolve('src/plugins/plugin-claude-code-cli.ts'),
  '@truenine/plugin-cursor': resolve('src/plugins/plugin-cursor.ts'),
  '@truenine/plugin-droid-cli': resolve('src/plugins/plugin-droid-cli.ts'),
  '@truenine/plugin-editorconfig': resolve('src/plugins/plugin-editorconfig.ts'),
  '@truenine/plugin-gemini-cli': resolve('src/plugins/plugin-gemini-cli.ts'),
  '@truenine/plugin-git-exclude': resolve('src/plugins/plugin-git-exclude.ts'),
  '@truenine/plugin-input-agentskills': resolve('src/plugins/plugin-input-agentskills/index.ts'),
  '@truenine/plugin-input-editorconfig': resolve('src/plugins/plugin-input-editorconfig/index.ts'),
  '@truenine/plugin-input-fast-command': resolve('src/plugins/plugin-input-fast-command/index.ts'),
  '@truenine/plugin-input-git-exclude': resolve('src/plugins/plugin-input-git-exclude/index.ts'),
  '@truenine/plugin-input-gitignore': resolve('src/plugins/plugin-input-gitignore/index.ts'),
  '@truenine/plugin-input-global-memory': resolve('src/plugins/plugin-input-global-memory/index.ts'),
  '@truenine/plugin-input-jetbrains-config': resolve('src/plugins/plugin-input-jetbrains-config/index.ts'),
  '@truenine/plugin-input-md-cleanup-effect': resolve('src/plugins/plugin-input-md-cleanup-effect/index.ts'),
  '@truenine/plugin-input-orphan-cleanup-effect': resolve('src/plugins/plugin-input-orphan-cleanup-effect/index.ts'),
  '@truenine/plugin-input-project-prompt': resolve('src/plugins/plugin-input-project-prompt/index.ts'),
  '@truenine/plugin-input-readme': resolve('src/plugins/plugin-input-readme/index.ts'),
  '@truenine/plugin-input-rule': resolve('src/plugins/plugin-input-rule/index.ts'),
  '@truenine/plugin-input-shadow-project': resolve('src/plugins/plugin-input-shadow-project/index.ts'),
  '@truenine/plugin-input-shared-ignore': resolve('src/plugins/plugin-input-shared-ignore/index.ts'),
  '@truenine/plugin-input-skill-sync-effect': resolve('src/plugins/plugin-input-skill-sync-effect/index.ts'),
  '@truenine/plugin-input-subagent': resolve('src/plugins/plugin-input-subagent/index.ts'),
  '@truenine/plugin-input-vscode-config': resolve('src/plugins/plugin-input-vscode-config/index.ts'),
  '@truenine/plugin-input-workspace': resolve('src/plugins/plugin-input-workspace/index.ts'),
  '@truenine/plugin-jetbrains-ai-codex': resolve('src/plugins/plugin-jetbrains-ai-codex.ts'),
  '@truenine/plugin-jetbrains-codestyle': resolve('src/plugins/plugin-jetbrains-codestyle.ts'),
  '@truenine/plugin-openai-codex-cli': resolve('src/plugins/plugin-openai-codex-cli.ts'),
  '@truenine/plugin-opencode-cli': resolve('src/plugins/plugin-opencode-cli.ts'),
  '@truenine/plugin-qoder-ide': resolve('src/plugins/plugin-qoder-ide.ts'),
  '@truenine/plugin-readme': resolve('src/plugins/plugin-readme.ts'),
  '@truenine/plugin-trae-ide': resolve('src/plugins/plugin-trae-ide.ts'),
  '@truenine/plugin-vscode': resolve('src/plugins/plugin-vscode.ts'),
  '@truenine/plugin-warp-ide': resolve('src/plugins/plugin-warp-ide.ts'),
  '@truenine/plugin-windsurf': resolve('src/plugins/plugin-windsurf.ts')
}

const noExternalDeps = [
  '@truenine/logger',
  '@truenine/script-runtime',
  'fast-glob',
  'jiti',
  '@truenine/desk-paths',
  '@truenine/md-compiler',
  ...Object.keys(pluginAliases)
]

export default defineConfig([
  {
    entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    inlineOnly: false,
    alias: {
      '@': resolve('src'),
      ...pluginAliases
    },
    noExternal: noExternalDeps,
    format: ['esm'],
    minify: true,
    dts: {sourcemap: false},
    outputOptions: {exports: 'named'},
    define: {
      __CLI_VERSION__: JSON.stringify(pkg.version),
      __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry
    }
  },
  {
    entry: ['./src/plugin-runtime.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    inlineOnly: false,
    alias: {
      '@': resolve('src'),
      ...pluginAliases
    },
    noExternal: noExternalDeps,
    format: ['esm'],
    minify: true,
    dts: false,
    define: {
      __CLI_VERSION__: JSON.stringify(pkg.version),
      __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry
    }
  },
  {
    entry: ['./src/script-runtime-worker.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    inlineOnly: false,
    alias: {
      '@': resolve('src'),
      ...pluginAliases
    },
    noExternal: noExternalDeps,
    format: ['esm'],
    minify: false,
    dts: false,
    define: {
      __CLI_VERSION__: JSON.stringify(pkg.version),
      __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry
    }
  },
  {
    entry: ['./src/globals.ts'],
    platform: 'node',
    sourcemap: false,
    alias: {
      '@': resolve('src'),
      ...pluginAliases
    },
    format: ['esm'],
    minify: false,
    dts: {sourcemap: false}
  }
])
