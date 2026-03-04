export const PLUGIN_NAMES = {
  AgentsOutput: 'AgentsOutputPlugin',
  GeminiCLIOutput: 'GeminiCLIOutputPlugin',
  CursorOutput: 'CursorOutputPlugin',
  WindsurfOutput: 'WindsurfOutputPlugin',
  ClaudeCodeCLIOutput: 'ClaudeCodeCLIOutputPlugin',
  KiroIDEOutput: 'KiroCLIOutputPlugin',
  OpencodeCLIOutput: 'OpencodeCLIOutputPlugin',
  OpenAICodexCLIOutput: 'CodexCLIOutputPlugin',
  DroidCLIOutput: 'DroidCLIOutputPlugin',
  WarpIDEOutput: 'WarpIDEOutputPlugin',
  TraeIDEOutput: 'TraeIDEOutputPlugin',
  TraeCNIDEOutput: 'TraeCNIDEOutputPlugin',
  QoderIDEOutput: 'QoderIDEPluginOutputPlugin',
  JetBrainsCodeStyleOutput: 'JetBrainsIDECodeStyleConfigOutputPlugin',
  JetBrainsAICodexOutput: 'JetBrainsAIAssistantCodexOutputPlugin',
  AgentSkillsCompactOutput: 'GenericSkillsOutputPlugin',
  GitExcludeOutput: 'GitExcludeOutputPlugin',
  ReadmeOutput: 'ReadmeMdConfigFileOutputPlugin',
  VSCodeOutput: 'VisualStudioCodeIDEConfigOutputPlugin',
  EditorConfigOutput: 'EditorConfigOutputPlugin',
  AntigravityOutput: 'AntigravityOutputPlugin'
} as const

export type PluginName = (typeof PLUGIN_NAMES)[keyof typeof PLUGIN_NAMES]
