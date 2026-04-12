import type {PipelineConfig} from '../config'
import {ClaudeCodeCLIOutputAdaptor} from '../adaptors/ClaudeCodeCLIOutputAdaptor'
import {CodexCLIOutputAdaptor} from '../adaptors/CodexCLIOutputAdaptor'
import {CursorOutputAdaptor} from '../adaptors/CursorOutputAdaptor'
import {JetBrainsAIAssistantCodexOutputAdaptor} from '../adaptors/JetBrainsAIAssistantCodexOutputAdaptor'
import {KiroCLIOutputAdaptor} from '../adaptors/KiroCLIOutputAdaptor'
import {
  NativeAgentsOutputAdaptor,
  NativeGitExcludeOutputAdaptor,
  NativeJetBrainsIDECodeStyleConfigOutputAdaptor,
  NativeReadmeMdConfigFileOutputAdaptor,
  NativeVisualStudioCodeIDEConfigOutputAdaptor,
  NativeZedIDEConfigOutputAdaptor
} from '../adaptors/NativeBaseOutputAdaptor'
import {NativeDroidCLIOutputAdaptor} from '../adaptors/NativeDroidCLIOutputAdaptor'
import {NativeGeminiCLIOutputAdaptor} from '../adaptors/NativeGeminiCLIOutputAdaptor'
import {OpencodeCLIOutputAdaptor} from '../adaptors/OpencodeCLIOutputAdaptor'
import {QoderIDEPluginOutputAdaptor} from '../adaptors/QoderIDEPluginOutputAdaptor'
import {TraeCNIDEOutputAdaptor} from '../adaptors/TraeCNIDEOutputAdaptor'
import {TraeIDEOutputAdaptor} from '../adaptors/TraeIDEOutputAdaptor'
import {WarpIDEOutputAdaptor} from '../adaptors/WarpIDEOutputAdaptor'
import {WindsurfOutputAdaptor} from '../adaptors/WindsurfOutputAdaptor'

export interface DefaultOutputAdaptorDescriptor {
  readonly name: string
  readonly kind: 'Output'
  readonly description: string
  readonly dependencies: readonly string[]
}

export function createDefaultOutputAdaptors(): PipelineConfig['outputPlugins'] {
  return [
    new NativeAgentsOutputAdaptor(),
    new ClaudeCodeCLIOutputAdaptor(),
    new CodexCLIOutputAdaptor(),
    new JetBrainsAIAssistantCodexOutputAdaptor(),
    new NativeDroidCLIOutputAdaptor(),
    new NativeGeminiCLIOutputAdaptor(),
    new KiroCLIOutputAdaptor(),
    new OpencodeCLIOutputAdaptor(),
    new QoderIDEPluginOutputAdaptor(),
    new TraeIDEOutputAdaptor(),
    new TraeCNIDEOutputAdaptor(),
    new WarpIDEOutputAdaptor(),
    new WindsurfOutputAdaptor(),
    new CursorOutputAdaptor(),
    new NativeGitExcludeOutputAdaptor(),
    new NativeJetBrainsIDECodeStyleConfigOutputAdaptor(),
    new NativeVisualStudioCodeIDEConfigOutputAdaptor(),
    new NativeZedIDEConfigOutputAdaptor(),
    new NativeReadmeMdConfigFileOutputAdaptor()
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
