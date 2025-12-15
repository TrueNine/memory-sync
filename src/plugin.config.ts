import { defineConfig } from '@/config'
import { AgentMdOutputPlugin } from '@/plugins/AgentMdOutputPlugin'
import { FileSystemFastCommandPlugin } from '@/plugins/FileSystemFastCommandPlugin'
import { FileSystemGlobalMemoryPlugin } from '@/plugins/FileSystemGlobalMemoryPlugin'
import { FileSystemIdeConfigPlugin } from '@/plugins/FileSystemIdeConfigPlugin'
import { FileSystemProjectPromptPlugin } from '@/plugins/FileSystemProjectPromptPlugin'
import { FileSystemShadowProjectPlugin } from '@/plugins/FileSystemShadowProjectPlugin'
import { FileSystemSkillPlugin } from '@/plugins/FileSystemSkillPlugin'
import { FileSystemSubAgentPlugin } from '@/plugins/FileSystemSubAgentPlugin'
import { FileSystemWorkspacePlugin } from '@/plugins/FileSystemWorkspacePlugin'

export default defineConfig({
  plugins: [
    new AgentMdOutputPlugin(),

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
