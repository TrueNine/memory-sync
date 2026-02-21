import {GenericSkillsOutputPlugin} from '@truenine/plugin-agentskills-compact'
import {AgentsOutputPlugin} from '@truenine/plugin-agentsmd'
import {AntigravityOutputPlugin} from '@truenine/plugin-antigravity'
import {ClaudeCodeCLIOutputPlugin} from '@truenine/plugin-claude-code-cli'
import {CursorOutputPlugin} from '@truenine/plugin-cursor'
import {DroidCLIOutputPlugin} from '@truenine/plugin-droid-cli'
import {EditorConfigOutputPlugin} from '@truenine/plugin-editorconfig'
import {GeminiCLIOutputPlugin} from '@truenine/plugin-gemini-cli'
import {GitExcludeOutputPlugin} from '@truenine/plugin-git-exclude'
import {SkillInputPlugin} from '@truenine/plugin-input-agentskills'
import {EditorConfigInputPlugin} from '@truenine/plugin-input-editorconfig'
import {FastCommandInputPlugin} from '@truenine/plugin-input-fast-command'
import {GitExcludeInputPlugin} from '@truenine/plugin-input-git-exclude'
import {GitIgnoreInputPlugin} from '@truenine/plugin-input-gitignore'
import {GlobalMemoryInputPlugin} from '@truenine/plugin-input-global-memory'
import {JetBrainsConfigInputPlugin} from '@truenine/plugin-input-jetbrains-config'
import {MarkdownWhitespaceCleanupEffectInputPlugin} from '@truenine/plugin-input-md-cleanup-effect'
import {OrphanFileCleanupEffectInputPlugin} from '@truenine/plugin-input-orphan-cleanup-effect'
import {ProjectPromptInputPlugin} from '@truenine/plugin-input-project-prompt'
import {ReadmeMdInputPlugin} from '@truenine/plugin-input-readme'
import {RuleInputPlugin} from '@truenine/plugin-input-rule'
import {ShadowProjectInputPlugin} from '@truenine/plugin-input-shadow-project'
import {SkillNonSrcFileSyncEffectInputPlugin} from '@truenine/plugin-input-skill-sync-effect'
import {SubAgentInputPlugin} from '@truenine/plugin-input-subagent'
import {VSCodeConfigInputPlugin} from '@truenine/plugin-input-vscode-config'
import {WorkspaceInputPlugin} from '@truenine/plugin-input-workspace'
import {JetBrainsAIAssistantCodexOutputPlugin} from '@truenine/plugin-jetbrains-ai-codex'
import {JetBrainsIDECodeStyleConfigOutputPlugin} from '@truenine/plugin-jetbrains-codestyle'
import {KiroCLIOutputPlugin} from '@truenine/plugin-kiro-ide'
import {CodexCLIOutputPlugin} from '@truenine/plugin-openai-codex-cli'
import {OpencodeCLIOutputPlugin} from '@truenine/plugin-opencode-cli'
import {QoderIDEPluginOutputPlugin} from '@truenine/plugin-qoder-ide'
import {ReadmeMdConfigFileOutputPlugin} from '@truenine/plugin-readme'
import {TraeIDEOutputPlugin} from '@truenine/plugin-trae-ide'
import {VisualStudioCodeIDEConfigOutputPlugin} from '@truenine/plugin-vscode'
import {WarpIDEOutputPlugin} from '@truenine/plugin-warp-ide'
import {WindsurfOutputPlugin} from '@truenine/plugin-windsurf'
import {defineConfig} from '@/config'

export default defineConfig({
  plugins: [
    new AgentsOutputPlugin(),
    new AntigravityOutputPlugin(),
    new ClaudeCodeCLIOutputPlugin(),
    new CodexCLIOutputPlugin(),
    new JetBrainsAIAssistantCodexOutputPlugin(),
    new DroidCLIOutputPlugin(),
    new GeminiCLIOutputPlugin(),
    new GenericSkillsOutputPlugin(),
    new KiroCLIOutputPlugin(),
    new OpencodeCLIOutputPlugin(),
    new QoderIDEPluginOutputPlugin(),
    new TraeIDEOutputPlugin(),
    new WarpIDEOutputPlugin(),
    new WindsurfOutputPlugin(),
    new CursorOutputPlugin(),
    new GitExcludeOutputPlugin(),

    new JetBrainsIDECodeStyleConfigOutputPlugin(),
    new EditorConfigOutputPlugin(),
    new VisualStudioCodeIDEConfigOutputPlugin(),
    new ReadmeMdConfigFileOutputPlugin(),

    new SkillNonSrcFileSyncEffectInputPlugin(), // Effect Input Plugins (executed in priority order: 10, 20, 30)
    new OrphanFileCleanupEffectInputPlugin(),
    new MarkdownWhitespaceCleanupEffectInputPlugin(),

    new WorkspaceInputPlugin(),
    new ShadowProjectInputPlugin(),
    new VSCodeConfigInputPlugin(),
    new JetBrainsConfigInputPlugin(),
    new EditorConfigInputPlugin(),
    new SkillInputPlugin(),
    new FastCommandInputPlugin(),
    new SubAgentInputPlugin(),
    new RuleInputPlugin(),
    new GlobalMemoryInputPlugin(),
    new ProjectPromptInputPlugin(),
    new ReadmeMdInputPlugin(),
    new GitIgnoreInputPlugin(),
    new GitExcludeInputPlugin()
  ]
})
