import type {PipelineConfig, RuntimeCommand} from '@truenine/memory-sync-sdk'
import process from 'node:process'
import {
  AgentsOutputPlugin,
  ClaudeCodeCLIOutputPlugin,
  CodexCLIOutputPlugin,
  CursorOutputPlugin,
  defineConfig,
  DroidCLIOutputPlugin,
  EditorConfigOutputPlugin,
  GeminiCLIOutputPlugin,
  GitExcludeOutputPlugin,
  JetBrainsAIAssistantCodexOutputPlugin,
  JetBrainsIDECodeStyleConfigOutputPlugin,
  KiroCLIOutputPlugin,
  OpencodeCLIOutputPlugin,
  QoderIDEPluginOutputPlugin,
  ReadmeMdConfigFileOutputPlugin,
  TraeCNIDEOutputPlugin,
  TraeIDEOutputPlugin,
  VisualStudioCodeIDEConfigOutputPlugin,
  WarpIDEOutputPlugin,
  WindsurfOutputPlugin,
  ZedIDEConfigOutputPlugin
} from '@truenine/memory-sync-sdk'

export function resolveRuntimeCommandFromArgv(argv: readonly string[] = process.argv): RuntimeCommand {
  const args = argv.filter((arg): arg is string => arg != null)
  const userArgs = args.slice(2)
  const subcommand = userArgs.find(arg => !arg.startsWith('-'))
  if (subcommand === 'plugins') return 'plugins'
  if (subcommand === 'clean') return 'clean'
  if (subcommand === 'dry-run' || userArgs.includes('--dry-run') || userArgs.includes('-n')) return 'dry-run'
  return 'execute'
}

export async function createDefaultPluginConfig(
  argv: readonly string[] = process.argv,
  runtimeCommand: RuntimeCommand = resolveRuntimeCommandFromArgv(argv)
): Promise<PipelineConfig> {
  return defineConfig({
    runtimeCommand,
    pluginOptions: {
      plugins: [
        new AgentsOutputPlugin(),
        new ClaudeCodeCLIOutputPlugin(),
        new CodexCLIOutputPlugin(),
        new JetBrainsAIAssistantCodexOutputPlugin(),
        new DroidCLIOutputPlugin(),
        new GeminiCLIOutputPlugin(),
        new KiroCLIOutputPlugin(),
        new OpencodeCLIOutputPlugin(),
        new QoderIDEPluginOutputPlugin(),
        new TraeIDEOutputPlugin(),
        new TraeCNIDEOutputPlugin(),
        new WarpIDEOutputPlugin(),
        new WindsurfOutputPlugin(),
        new CursorOutputPlugin(),
        new GitExcludeOutputPlugin(),
        new JetBrainsIDECodeStyleConfigOutputPlugin(),
        new EditorConfigOutputPlugin(),
        new VisualStudioCodeIDEConfigOutputPlugin(),
        new ZedIDEConfigOutputPlugin(),
        new ReadmeMdConfigFileOutputPlugin()
      ]
    }
  })
}

export default createDefaultPluginConfig
