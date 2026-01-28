import {defineConfig} from 'memory-sync-cli/src/config'
import {AgentsOutputPlugin} from 'memory-sync-cli/src/plugins/AgentsOutputPlugin'
import {AIAgentIgnoreConfigFileInputPlugin} from 'memory-sync-cli/src/plugins/AIAgentIgnoreConfigFileInputPlugin'
import {AIAgentIgnoreConfigFileOutputPlugin} from 'memory-sync-cli/src/plugins/AIAgentIgnoreConfigFileOutputPlugin'
import {AntigravityOutputPlugin} from 'memory-sync-cli/src/plugins/AntigravityOutputPlugin'
import {ClaudeCodeCLIOutputPlugin} from 'memory-sync-cli/src/plugins/ClaudeCodeCLIOutputPlugin'
import {CodexCLIOutputPlugin} from 'memory-sync-cli/src/plugins/CodexCLIOutputPlugin'
import {DroidCLIOutputPlugin} from 'memory-sync-cli/src/plugins/DroidCLIOutputPlugin'
import {FastCommandInputPlugin} from 'memory-sync-cli/src/plugins/FastCommandInputPlugin'
import {GeminiCLIOutputPlugin} from 'memory-sync-cli/src/plugins/GeminiCLIOutputPlugin'
import {GenericSkillsOutputPlugin} from 'memory-sync-cli/src/plugins/GenericSkillsOutputPlugin'
import {GitExcludeInputPlugin} from 'memory-sync-cli/src/plugins/GitExcludeInputPlugin'
import {GitExcludeOutputPlugin} from 'memory-sync-cli/src/plugins/GitExcludeOutputPlugin'
import {GitIgnoreInputPlugin} from 'memory-sync-cli/src/plugins/GitIgnoreInputPlugin'
import {GlobalMemoryInputPlugin} from 'memory-sync-cli/src/plugins/GlobalMemoryInputPlugin'
import {IdeConfigInputPlugin} from 'memory-sync-cli/src/plugins/IdeConfigInputPlugin'
import {JetBrainsIDECodeStyleConfigOutputPlugin} from 'memory-sync-cli/src/plugins/JetBrainsIDECodeStyleConfigOutputPlugin'
import {KiroCLIOutputPlugin} from 'memory-sync-cli/src/plugins/KiroCLIOutputPlugin'
import {MarkdownWhitespaceCleanupEffectInputPlugin} from 'memory-sync-cli/src/plugins/MarkdownWhitespaceCleanupEffectInputPlugin'
import {OrphanFileCleanupEffectInputPlugin} from 'memory-sync-cli/src/plugins/OrphanFileCleanupEffectInputPlugin'
import {ProjectPromptInputPlugin} from 'memory-sync-cli/src/plugins/ProjectPromptInputPlugin'
import {ReadmeMdConfigFileOutputPlugin} from 'memory-sync-cli/src/plugins/ReadmeMdConfigFileOutputPlugin'
import {ReadmeMdInputPlugin} from 'memory-sync-cli/src/plugins/ReadmeMdInputPlugin'
import {ShadowProjectInputPlugin} from 'memory-sync-cli/src/plugins/ShadowProjectInputPlugin'
import {SkillInputPlugin} from 'memory-sync-cli/src/plugins/SkillInputPlugin'
import {SkillNonSrcFileSyncEffectInputPlugin} from 'memory-sync-cli/src/plugins/SkillNonSrcFileSyncEffectInputPlugin'
import {SubAgentInputPlugin} from 'memory-sync-cli/src/plugins/SubAgentInputPlugin'
import {VisualStudioCodeIDEConfigOutputPlugin} from 'memory-sync-cli/src/plugins/VisualStudioCodeIDEConfigOutputPlugin'
import {WarpIDEOutputPlugin} from 'memory-sync-cli/src/plugins/WarpIDEOutputPlugin'
import {WorkspaceInputPlugin} from 'memory-sync-cli/src/plugins/WorkspaceInputPlugin'

export default defineConfig({
  plugins: [
    new AgentsOutputPlugin(),
    new AIAgentIgnoreConfigFileOutputPlugin(),
    new AntigravityOutputPlugin(),
    new ClaudeCodeCLIOutputPlugin(),
    new CodexCLIOutputPlugin(),
    new DroidCLIOutputPlugin(),
    new GeminiCLIOutputPlugin(),
    new GenericSkillsOutputPlugin(),
    new KiroCLIOutputPlugin(),
    new WarpIDEOutputPlugin(),
    new GitExcludeOutputPlugin(),

    new JetBrainsIDECodeStyleConfigOutputPlugin(),
    new VisualStudioCodeIDEConfigOutputPlugin(),
    new ReadmeMdConfigFileOutputPlugin(),

    new SkillNonSrcFileSyncEffectInputPlugin(), // Effect Input Plugins (executed in priority order: 10, 20, 30)
    new OrphanFileCleanupEffectInputPlugin(),
    new MarkdownWhitespaceCleanupEffectInputPlugin(),

    new WorkspaceInputPlugin(),
    new ShadowProjectInputPlugin(),
    new AIAgentIgnoreConfigFileInputPlugin(),
    new IdeConfigInputPlugin(),
    new SkillInputPlugin(),
    new FastCommandInputPlugin(),
    new SubAgentInputPlugin(),
    new GlobalMemoryInputPlugin(),
    new ProjectPromptInputPlugin(),
    new ReadmeMdInputPlugin(),
    new GitIgnoreInputPlugin(),
    new GitExcludeInputPlugin()
  ]
})
