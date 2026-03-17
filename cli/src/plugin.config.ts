import type {PipelineConfig} from '@/config'
import process from 'node:process'
import {GenericSkillsOutputPlugin} from '@truenine/plugin-agentskills-compact'
import {AgentsOutputPlugin} from '@truenine/plugin-agentsmd'
import {ClaudeCodeCLIOutputPlugin} from '@truenine/plugin-claude-code-cli'
import {CursorOutputPlugin} from '@truenine/plugin-cursor'
import {DroidCLIOutputPlugin} from '@truenine/plugin-droid-cli'
import {EditorConfigOutputPlugin} from '@truenine/plugin-editorconfig'
import {GeminiCLIOutputPlugin} from '@truenine/plugin-gemini-cli'
import {GitExcludeOutputPlugin} from '@truenine/plugin-git-exclude'
import {JetBrainsAIAssistantCodexOutputPlugin} from '@truenine/plugin-jetbrains-ai-codex'
import {JetBrainsIDECodeStyleConfigOutputPlugin} from '@truenine/plugin-jetbrains-codestyle'
import {CodexCLIOutputPlugin} from '@truenine/plugin-openai-codex-cli'
import {OpencodeCLIOutputPlugin} from '@truenine/plugin-opencode-cli'
import {QoderIDEPluginOutputPlugin} from '@truenine/plugin-qoder-ide'
import {ReadmeMdConfigFileOutputPlugin} from '@truenine/plugin-readme'
import {TraeIDEOutputPlugin} from '@truenine/plugin-trae-ide'
import {VisualStudioCodeIDEConfigOutputPlugin} from '@truenine/plugin-vscode'
import {WarpIDEOutputPlugin} from '@truenine/plugin-warp-ide'
import {WindsurfOutputPlugin} from '@truenine/plugin-windsurf'
import {defineConfig} from '@/config'
import {TraeCNIDEOutputPlugin} from '@/plugins/plugin-trae-cn-ide'

export async function createDefaultPluginConfig(
  pipelineArgs: readonly string[] = process.argv
): Promise<PipelineConfig> {
  return defineConfig({
    pipelineArgs,
    pluginOptions: {
      plugins: [
        new AgentsOutputPlugin(),
        new ClaudeCodeCLIOutputPlugin(),
        new CodexCLIOutputPlugin(),
        new JetBrainsAIAssistantCodexOutputPlugin(),
        new DroidCLIOutputPlugin(),
        new GeminiCLIOutputPlugin(),
        new GenericSkillsOutputPlugin(),
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
        new ReadmeMdConfigFileOutputPlugin()
      ]
    }
  })
}

export default createDefaultPluginConfig
