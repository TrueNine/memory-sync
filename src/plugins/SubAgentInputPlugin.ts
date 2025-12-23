import type { CollectedInputContext, InputPluginContext, SubAgentPrompt, SubAgentYAMLFrontMatter } from '@/types'

import { DEFAULT_SHADOW_SUB_AGENT_DIR } from '@/constants'
import { parseMarkdown } from '@/markdown'
import {
    FilePathKind,
    PromptKind,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

export class SubAgentInputPlugin extends AbstractInputPlugin {
    constructor() {
        super('SubAgentInputPlugin')
    }

    collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
        const { userConfigOptions: options, logger, fs, path } = ctx
        const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

        const subAgentDirRaw = options.shadowSubAgentDir ?? DEFAULT_SHADOW_SUB_AGENT_DIR
        const subAgentDir = this.resolvePath(subAgentDirRaw, workspaceDir, shadowProjectDir)

        const subAgents: SubAgentPrompt[] = []
        if (fs.existsSync(subAgentDir) && fs.statSync(subAgentDir).isDirectory()) {
            try {
                const entries = fs.readdirSync(subAgentDir, { withFileTypes: true })
                for (const entry of entries) {
                    if (entry.isFile() && entry.name.endsWith('.md')) {
                        const filePath = path.join(subAgentDir, entry.name)
                        const rawContent = fs.readFileSync(filePath, 'utf-8')
                        const parsed = parseMarkdown<SubAgentYAMLFrontMatter>(rawContent)
                        const content = parsed.contentWithoutFrontMatter
                        subAgents.push({
                            type: PromptKind.SubAgent,
                            content,
                            length: content.length,
                            filePathKind: FilePathKind.Relative,
                            ...(parsed.yamlFrontMatter != null && { yamlFrontMatter: parsed.yamlFrontMatter }),
                            ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
                            markdownAst: parsed.markdownAst,
                            markdownContents: parsed.markdownContents,
                            dir: {
                                pathKind: FilePathKind.Relative,
                                path: entry.name,
                                basePath: subAgentDir,
                                getDirectoryName: () => entry.name.replace(/\.md$/, ''),
                                getAbsolutePath: () => filePath,
                            },
                        })
                    }
                }
            } catch (e) {
                logger.error(`Failed to scan sub agents at ${subAgentDir}`, { error: e })
            }
        }

        return { subAgents }
    }
}
