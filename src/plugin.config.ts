import {defineConfig} from '@/config'
import {AgentsOutputPlugin} from '@/plugins/AgentsOutputPlugin'
import {AIAgentIgnoreConfigFileInputPlugin} from '@/plugins/AIAgentIgnoreConfigFileInputPlugin'
import {AIAgentIgnoreConfigFileOutputPlugin} from '@/plugins/AIAgentIgnoreConfigFileOutputPlugin'
import {AntigravityOutputPlugin} from '@/plugins/AntigravityOutputPlugin'
import {ClaudeCodeCLIOutputPlugin} from '@/plugins/ClaudeCodeCLIOutputPlugin'
import {CodexCLIOutputPlugin} from '@/plugins/CodexCLIOutputPlugin'
import {DroidCLIOutputPlugin} from '@/plugins/DroidCLIOutputPlugin'
import {FastCommandInputPlugin} from '@/plugins/FastCommandInputPlugin'
import {GeminiCLIOutputPlugin} from '@/plugins/GeminiCLIOutputPlugin'
import {GenericSkillsOutputPlugin} from '@/plugins/GenericSkillsOutputPlugin'
import {GitExcludeInputPlugin} from '@/plugins/GitExcludeInputPlugin'
import {GitExcludeOutputPlugin} from '@/plugins/GitExcludeOutputPlugin'
import {GitIgnoreInputPlugin} from '@/plugins/GitIgnoreInputPlugin'
import {GlobalMemoryInputPlugin} from '@/plugins/GlobalMemoryInputPlugin'
import {IdeConfigInputPlugin} from '@/plugins/IdeConfigInputPlugin'
import {JetBrainsIDECodeStyleConfigOutputPlugin} from '@/plugins/JetBrainsIDECodeStyleConfigOutputPlugin'
import {KiroCLIOutputPlugin} from '@/plugins/KiroCLIOutputPlugin'
import {MarkdownWhitespaceCleanupEffectInputPlugin} from '@/plugins/MarkdownWhitespaceCleanupEffectInputPlugin'
import {OrphanFileCleanupEffectInputPlugin} from '@/plugins/OrphanFileCleanupEffectInputPlugin'
import {ProjectPromptInputPlugin} from '@/plugins/ProjectPromptInputPlugin'
import {ReadmeMdConfigFileOutputPlugin} from '@/plugins/ReadmeMdConfigFileOutputPlugin'
import {ReadmeMdInputPlugin} from '@/plugins/ReadmeMdInputPlugin'
import {ShadowProjectInputPlugin} from '@/plugins/ShadowProjectInputPlugin'
import {SkillInputPlugin} from '@/plugins/SkillInputPlugin'
import {SkillNonSrcFileSyncEffectInputPlugin} from '@/plugins/SkillNonSrcFileSyncEffectInputPlugin'
import {SubAgentInputPlugin} from '@/plugins/SubAgentInputPlugin'
import {VisualStudioCodeIDEConfigOutputPlugin} from '@/plugins/VisualStudioCodeIDEConfigOutputPlugin'
import {WarpIDEOutputPlugin} from '@/plugins/WarpIDEOutputPlugin'
import {WorkspaceInputPlugin} from '@/plugins/WorkspaceInputPlugin'

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
    new GitExcludeInputPlugin(),
  ],
})
