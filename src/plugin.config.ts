import { defineConfig } from '@/config'
import { AgentsOutputPlugin } from '@/plugins/AgentsOutputPlugin'
import { ClaudeCodeCLIOutputPlugin } from '@/plugins/ClaudeCodeCLIOutputPlugin'
import { DroidCLIOutputPlugin } from '@/plugins/DroidCLIOutputPlugin'
import { FileSystemFastCommandPlugin } from '@/plugins/FileSystemFastCommandPlugin'
import { FileSystemGlobalMemoryPlugin } from '@/plugins/FileSystemGlobalMemoryPlugin'
import { FileSystemIdeConfigPlugin } from '@/plugins/FileSystemIdeConfigPlugin'
import { FileSystemProjectPromptPlugin } from '@/plugins/FileSystemProjectPromptPlugin'
import { FileSystemShadowProjectPlugin } from '@/plugins/FileSystemShadowProjectPlugin'
import { FileSystemSkillPlugin } from '@/plugins/FileSystemSkillPlugin'
import { FileSystemSubAgentPlugin } from '@/plugins/FileSystemSubAgentPlugin'
import { FileSystemWorkspacePlugin } from '@/plugins/FileSystemWorkspacePlugin'
import { GeminiCLIOutputPlugin } from '@/plugins/GeminiCLIOutputPlugin'
import { JetBrainsIDECodeStyleConfigOutputPlugin } from '@/plugins/JetBrainsIDECodeStyleConfigOutputPlugin'
import { WarpIDEOutputPlugin } from '@/plugins/WarpIDEOutputPlugin'
import { VisualStudioCodeIDEConfigOutputPlugin } from './plugins/VisualStudioCodeIDEConfigOutputPlugin'

export default defineConfig({
  plugins: [
    new AgentsOutputPlugin(),
    new ClaudeCodeCLIOutputPlugin(),
    new DroidCLIOutputPlugin(),
    new GeminiCLIOutputPlugin(),
    new WarpIDEOutputPlugin(),

    new JetBrainsIDECodeStyleConfigOutputPlugin(),
    new VisualStudioCodeIDEConfigOutputPlugin(),

    new FileSystemWorkspacePlugin(),
    new FileSystemShadowProjectPlugin(),
    new FileSystemIdeConfigPlugin(),
    new FileSystemSkillPlugin(),
    new FileSystemFastCommandPlugin(),
    new FileSystemSubAgentPlugin(),
    new FileSystemGlobalMemoryPlugin(),
    new FileSystemProjectPromptPlugin(),
  ],
})
