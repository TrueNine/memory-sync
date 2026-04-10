import type {PipelineConfig} from '../config'
import {AgentsOutputPlugin} from '../plugins/AgentsOutputPlugin'
import {ClaudeCodeCLIOutputPlugin} from '../plugins/ClaudeCodeCLIOutputPlugin'
import {CodexCLIOutputPlugin} from '../plugins/CodexCLIOutputPlugin'
import {CursorOutputPlugin} from '../plugins/CursorOutputPlugin'
import {DroidCLIOutputPlugin} from '../plugins/DroidCLIOutputPlugin'
import {GeminiCLIOutputPlugin} from '../plugins/GeminiCLIOutputPlugin'
import {GitExcludeOutputPlugin} from '../plugins/GitExcludeOutputPlugin'
import {JetBrainsAIAssistantCodexOutputPlugin} from '../plugins/JetBrainsAIAssistantCodexOutputPlugin'
import {JetBrainsIDECodeStyleConfigOutputPlugin} from '../plugins/JetBrainsIDECodeStyleConfigOutputPlugin'
import {KiroCLIOutputPlugin} from '../plugins/KiroCLIOutputPlugin'
import {OpencodeCLIOutputPlugin} from '../plugins/OpencodeCLIOutputPlugin'
import {QoderIDEPluginOutputPlugin} from '../plugins/QoderIDEPluginOutputPlugin'
import {ReadmeMdConfigFileOutputPlugin} from '../plugins/ReadmeMdConfigFileOutputPlugin'
import {TraeCNIDEOutputPlugin} from '../plugins/TraeCNIDEOutputPlugin'
import {TraeIDEOutputPlugin} from '../plugins/TraeIDEOutputPlugin'
import {VisualStudioCodeIDEConfigOutputPlugin} from '../plugins/VisualStudioCodeIDEConfigOutputPlugin'
import {WarpIDEOutputPlugin} from '../plugins/WarpIDEOutputPlugin'
import {WindsurfOutputPlugin} from '../plugins/WindsurfOutputPlugin'
import {ZedIDEConfigOutputPlugin} from '../plugins/ZedIDEConfigOutputPlugin'

export interface DefaultOutputPluginDescriptor {
  readonly name: string
  readonly kind: 'Output'
  readonly description: string
  readonly dependencies: readonly string[]
}

export function createDefaultOutputPlugins(): PipelineConfig['outputPlugins'] {
  return [
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
    new VisualStudioCodeIDEConfigOutputPlugin(),
    new ZedIDEConfigOutputPlugin(),
    new ReadmeMdConfigFileOutputPlugin()
  ]
}

export function describeDefaultOutputPlugins(): readonly DefaultOutputPluginDescriptor[] {
  return createDefaultOutputPlugins().map(plugin => ({
    name: plugin.name,
    kind: 'Output',
    description: plugin.name,
    dependencies: [...plugin.dependsOn ?? []]
  }))
}
