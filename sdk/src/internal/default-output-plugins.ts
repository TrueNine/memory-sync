import type {PipelineConfig} from '../config'
import {AgentsOutputAdaptor} from '../adaptors/AgentsOutputAdaptor'
import {ClaudeCodeCLIOutputAdaptor} from '../adaptors/ClaudeCodeCLIOutputAdaptor'
import {CodexCLIOutputAdaptor} from '../adaptors/CodexCLIOutputAdaptor'
import {CursorOutputAdaptor} from '../adaptors/CursorOutputAdaptor'
import {DroidCLIOutputAdaptor} from '../adaptors/DroidCLIOutputAdaptor'
import {GeminiCLIOutputAdaptor} from '../adaptors/GeminiCLIOutputAdaptor'
import {GitExcludeOutputAdaptor} from '../adaptors/GitExcludeOutputAdaptor'
import {JetBrainsAIAssistantCodexOutputAdaptor} from '../adaptors/JetBrainsAIAssistantCodexOutputAdaptor'
import {JetBrainsIDECodeStyleConfigOutputAdaptor} from '../adaptors/JetBrainsIDECodeStyleConfigOutputAdaptor'
import {KiroCLIOutputAdaptor} from '../adaptors/KiroCLIOutputAdaptor'
import {OpencodeCLIOutputAdaptor} from '../adaptors/OpencodeCLIOutputAdaptor'
import {QoderIDEPluginOutputAdaptor} from '../adaptors/QoderIDEPluginOutputAdaptor'
import {ReadmeMdConfigFileOutputAdaptor} from '../adaptors/ReadmeMdConfigFileOutputAdaptor'
import {TraeCNIDEOutputAdaptor} from '../adaptors/TraeCNIDEOutputAdaptor'
import {TraeIDEOutputAdaptor} from '../adaptors/TraeIDEOutputAdaptor'
import {VisualStudioCodeIDEConfigOutputAdaptor} from '../adaptors/VisualStudioCodeIDEConfigOutputAdaptor'
import {WarpIDEOutputAdaptor} from '../adaptors/WarpIDEOutputAdaptor'
import {WindsurfOutputAdaptor} from '../adaptors/WindsurfOutputAdaptor'
import {ZedIDEConfigOutputAdaptor} from '../adaptors/ZedIDEConfigOutputAdaptor'

export interface DefaultOutputAdaptorDescriptor {
  readonly name: string
  readonly kind: 'Output'
  readonly description: string
  readonly dependencies: readonly string[]
}

export function createDefaultOutputAdaptors(): PipelineConfig['outputPlugins'] {
  return [
    new AgentsOutputAdaptor(),
    new ClaudeCodeCLIOutputAdaptor(),
    new CodexCLIOutputAdaptor(),
    new JetBrainsAIAssistantCodexOutputAdaptor(),
    new DroidCLIOutputAdaptor(),
    new GeminiCLIOutputAdaptor(),
    new KiroCLIOutputAdaptor(),
    new OpencodeCLIOutputAdaptor(),
    new QoderIDEPluginOutputAdaptor(),
    new TraeIDEOutputAdaptor(),
    new TraeCNIDEOutputAdaptor(),
    new WarpIDEOutputAdaptor(),
    new WindsurfOutputAdaptor(),
    new CursorOutputAdaptor(),
    new GitExcludeOutputAdaptor(),
    new JetBrainsIDECodeStyleConfigOutputAdaptor(),
    new VisualStudioCodeIDEConfigOutputAdaptor(),
    new ZedIDEConfigOutputAdaptor(),
    new ReadmeMdConfigFileOutputAdaptor()
  ]
}

export function describeDefaultOutputAdaptors(): readonly DefaultOutputAdaptorDescriptor[] {
  return createDefaultOutputAdaptors().map(plugin => ({
    name: plugin.name,
    kind: 'Output',
    description: plugin.name,
    dependencies: [...plugin.dependsOn ?? []]
  }))
}
