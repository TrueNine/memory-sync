import { defineConfig } from '@/config'
import { AgentsOutputPlugin } from '@/plugins/AgentsOutputPlugin'
import { AIAgentIgnoreConfigFileInputPlugin } from '@/plugins/AIAgentIgnoreConfigFileInputPlugin'
import { AIAgentIgnoreConfigFileOutputPlugin } from '@/plugins/AIAgentIgnoreConfigFileOutputPlugin'
import { ClaudeCodeCLIOutputPlugin } from '@/plugins/ClaudeCodeCLIOutputPlugin'
import { DroidCLIOutputPlugin } from '@/plugins/DroidCLIOutputPlugin'
import { FastCommandInputPlugin } from '@/plugins/FastCommandInputPlugin'
import { GeminiCLIOutputPlugin } from '@/plugins/GeminiCLIOutputPlugin'
import { GlobalMemoryInputPlugin } from '@/plugins/GlobalMemoryInputPlugin'
import { IdeConfigInputPlugin } from '@/plugins/IdeConfigInputPlugin'
import { JetBrainsIDECodeStyleConfigOutputPlugin } from '@/plugins/JetBrainsIDECodeStyleConfigOutputPlugin'
import { KiroCLIOutputPlugin } from '@/plugins/KiroCLIOutputPlugin'
import { ProjectPromptInputPlugin } from '@/plugins/ProjectPromptInputPlugin'
import { ReadmeMdConfigFileOutputPlugin } from '@/plugins/ReadmeMdConfigFileOutputPlugin'
import { ReadmeMdInputPlugin } from '@/plugins/ReadmeMdInputPlugin'
import { ShadowProjectInputPlugin } from '@/plugins/ShadowProjectInputPlugin'
import { SkillInputPlugin } from '@/plugins/SkillInputPlugin'
import { SubAgentInputPlugin } from '@/plugins/SubAgentInputPlugin'
import { WarpIDEOutputPlugin } from '@/plugins/WarpIDEOutputPlugin'
import { WorkspaceInputPlugin } from '@/plugins/WorkspaceInputPlugin'
import { VisualStudioCodeIDEConfigOutputPlugin } from './plugins/VisualStudioCodeIDEConfigOutputPlugin'

export default defineConfig({
  plugins: [
    new AgentsOutputPlugin(),
    new AIAgentIgnoreConfigFileOutputPlugin(),
    new ClaudeCodeCLIOutputPlugin(),
    new DroidCLIOutputPlugin(),
    new GeminiCLIOutputPlugin(),
    new KiroCLIOutputPlugin(),
    new WarpIDEOutputPlugin(),

    new JetBrainsIDECodeStyleConfigOutputPlugin(),
    new VisualStudioCodeIDEConfigOutputPlugin(),
    new ReadmeMdConfigFileOutputPlugin(),

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
  ],
})
