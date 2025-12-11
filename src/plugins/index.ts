/**
 * Plugin exports
 */

// Base output plugins
export {
  createAgentsMdPlugin,
  filterMemoryPromptBundles,
  getWorkspaceFromBundle,
  processMemoryPromptBundle,
} from './AgentsMdPlugin'
export type { AgentsMdPluginOptions } from './AgentsMdPlugin'

// Input plugins
export { createAindexInputPlugin } from './AindexInputPlugin'
export type { AindexDistInfo, AindexInputPluginOptions } from './AindexInputPlugin'

// AntigravityIDEPlugin - IDE output plugin for Antigravity (extends WindsurfIDEPlugin)
export {
  createAntigravityIDEPlugin,
  filterAntigravityHandledBundles,
  generateAntigravityOutputFilename,
  processFastCommandForAntigravity,
  processMemoryPromptForAntigravity,
} from './AntigravityIDEPlugin'
export type { AntigravityIDEPluginOptions } from './AntigravityIDEPlugin'

export {
  cleanBlankLinesContent,
  createBlankLineCleanerPlugin,
} from './BlankLineCleanerPlugin'
export type { BlankLineCleanerPluginOptions } from './BlankLineCleanerPlugin'

// CLI output plugins
export {
  createClaudeCodeCLIPlugin,
  filterHandledBundles,
  getOutputFilename,
  getOutputSubdirectory,
  processInputBundle,
} from './ClaudeCodeCLIPlugin'
export type { ClaudeCodeCLIPluginOptions } from './ClaudeCodeCLIPlugin'

// CodeBuddyIDEPlugin - IDE output plugin for CodeBuddy (extends CursorIDEPlugin)
export {
  createCodeBuddyIDEPlugin,
  filterCodeBuddyHandledBundles,
  generateCodeBuddyOutputFilename,
  processMemoryPromptForCodeBuddy,
} from './CodeBuddyIDEPlugin'
export type { CodeBuddyIDEPluginOptions } from './CodeBuddyIDEPlugin'

export {
  createCodexCLIPlugin,
  filterHandledBundles as filterCodexHandledBundles,
  getOutputFilename as getCodexOutputFilename,
  getOutputSubdirectory as getCodexOutputSubdirectory,
  processInputBundle as processCodexInputBundle,
} from './CodexCLIPlugin'
export type { CodexCLIPluginOptions } from './CodexCLIPlugin'

// CursorIDEPlugin - IDE output plugin for Cursor rules (*.md -> *.mdc)
export {
  createCursorIDEPlugin,
  filterCursorHandledBundles,
  generateCursorOutputFilename,
  processMemoryPromptForCursor,
  transformCursorFilename,
} from './CursorIDEPlugin'
export type { CursorIDEPluginOptions } from './CursorIDEPlugin'

// DocLinkInputPlugin - Input plugin for scanning project documentation
export { createDocLinkInputPlugin } from './DocLinkInputPlugin'
export type { DocLinkInputPluginOptions, DocLinkProjectInfo } from './DocLinkInputPlugin'

// EditorconfigConfigPlugin - Config output plugin for .editorconfig files
export {
  createEditorconfigConfigPlugin,
  filterEditorconfigBundles,
  isEditorconfigBundle,
  processConfigFileForEditorconfig,
} from './EditorconfigConfigPlugin'
export type { EditorconfigConfigPluginOptions } from './EditorconfigConfigPlugin'

export {
  createFactoryDroidCLIPlugin,
  filterHandledBundles as filterFactoryDroidHandledBundles,
  getOutputFilename as getFactoryDroidOutputFilename,
  getOutputSubdirectory as getFactoryDroidOutputSubdirectory,
  processInputBundle as processFactoryDroidInputBundle,
} from './FactoryDroidCLIPlugin'
export type { FactoryDroidCLIPluginOptions } from './FactoryDroidCLIPlugin'

// Transform plugins
export {
  addFrontMatterToContent,
  createFrontMatterPlugin,
  generateFrontMatterByType,
  mergeFrontMatter,
  parseFrontMatter,
  removeBom,
  serializeFrontMatter,
} from './FrontMatterPlugin'
export type { FrontMatterPluginOptions } from './FrontMatterPlugin'

export {
  createGeminiCLIPlugin,
  filterGeminiHandledBundles,
  getGlobalPromptFilename,
  processGlobalPromptBundle,
} from './GeminiCLIPlugin'
export type { GeminiCLIPluginOptions } from './GeminiCLIPlugin'

// JetBrainsIDEConfigPlugin - Config output plugin for JetBrains IDE settings
export {
  createJetBrainsIDEConfigPlugin,
  filterJetBrainsConfigBundles,
  isJetBrainsConfigBundle,
  processConfigFileForJetBrains,
} from './JetBrainsIDEConfigPlugin'
export type { JetBrainsIDEConfigPluginOptions } from './JetBrainsIDEConfigPlugin'

// IDE output plugins
export {
  createKiroIDEPlugin,
  filterKiroHandledBundles,
  generateKiroFileMatchPattern,
  generateKiroOutputFilename,
  processGlobalPromptForKiro,
  processMemoryPromptForKiro,
} from './KiroIDEPlugin'
export type { KiroIDEPluginOptions } from './KiroIDEPlugin'

// QoderIDEPlugin - IDE output plugin for Qoder rules
export {
  createQoderIDEPlugin,
  filterQoderHandledBundles,
  generateQoderGlobPattern,
  generateQoderOutputFilename,
  processMemoryPromptForQoder,
} from './QoderIDEPlugin'
export type { QoderIDEPluginOptions } from './QoderIDEPlugin'

export { createRefInputPlugin } from './RefInputPlugin'
export type { RefInputPluginOptions, RefProjectInfo as RefInputProjectInfo } from './RefInputPlugin'

// VSCodeIDEConfigPlugin - Config output plugin for VSCode IDE settings
export {
  createVSCodeIDEConfigPlugin,
  filterVSCodeConfigBundles,
  isVSCodeConfigBundle,
  processConfigFileForVSCode,
} from './VSCodeIDEConfigPlugin'
export type { VSCodeIDEConfigPluginOptions } from './VSCodeIDEConfigPlugin'

// WindsurfIDEPlugin - IDE output plugin for Windsurf workflows
export {
  createWindsurfIDEPlugin,
  filterWindsurfHandledBundles,
  generateWindsurfOutputFilename,
  generateWorkflowFrontMatter,
  processFastCommandForWindsurf,
} from './WindsurfIDEPlugin'
export type { WindsurfIDEPluginOptions } from './WindsurfIDEPlugin'

export { createWorkspaceGroupInputPlugin } from './WorkspaceGroupInputPlugin'
export type { WorkspaceGroupInputPluginOptions, WorkspaceInfo } from './WorkspaceGroupInputPlugin'
