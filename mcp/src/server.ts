import type {
  ListPromptsOptions,
  ManagedPromptKind,
  MemorySyncSdkBinding,
  PromptArtifactState,
  PromptSourceLocale
} from '@truenine/memory-sync-sdk'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {getMemorySyncSdkBinding} from '@truenine/memory-sync-sdk'
import {z} from 'zod'

const promptKindSchema = z.enum([
  'global-memory',
  'workspace-memory',
  'project-memory',
  'project-child-memory',
  'skill',
  'skill-child-doc',
  'command',
  'subagent',
  'rule'
] satisfies readonly ManagedPromptKind[])

const promptStatusSchema = z.enum([
  'missing',
  'stale',
  'ready'
] satisfies readonly PromptArtifactState[])

const localeSchema = z.enum(['zh', 'en'] satisfies readonly PromptSourceLocale[])

const workspaceInputSchema = {
  workspaceDir: z.string().min(1).optional()
}
const MCP_PACKAGE_NAME = typeof __MCP_PACKAGE_NAME__ !== 'undefined'
  ? __MCP_PACKAGE_NAME__
  : '@truenine/memory-sync-mcp'
const MCP_VERSION = typeof __MCP_VERSION__ !== 'undefined'
  ? __MCP_VERSION__
  : 'dev'

function createPromptServiceOptions(
  workspaceDir?: string
): {cwd?: string, pluginOptions?: {workspaceDir: string}} {
  if (workspaceDir == null) return {}

  return {
    cwd: workspaceDir,
    pluginOptions: {
      workspaceDir
    }
  }
}

function getSdkBinding(): MemorySyncSdkBinding {
  return getMemorySyncSdkBinding()
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function validateTranslationPayload(input: {
  readonly enContent?: string | undefined
  readonly distContent?: string | undefined
}): void {
  if (input.enContent == null && input.distContent == null) throw new Error('apply_prompt_translation requires enContent or distContent')
}

function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function buildSuccessResult(value: unknown): {
  content: [{type: 'text', text: string}]
} {
  return {
    content: [
      {
        type: 'text',
        text: toJsonText(value)
      }
    ]
  }
}

function buildErrorResult(error: unknown): {
  content: [{type: 'text', text: string}]
  isError: true
} {
  const message = toErrorMessage(error)

  return {
    content: [
      {
        type: 'text',
        text: message
      }
    ],
    isError: true
  }
}

function registerListPromptsTool(server: McpServer): void {
  server.registerTool(
    'list_prompts',
    {
      title: 'List Prompts',
      description: 'List managed prompt records with zh/en/dist status signals.',
      inputSchema: {
        ...workspaceInputSchema,
        kinds: z.array(promptKindSchema).optional(),
        query: z.string().min(1).optional(),
        enStatus: z.array(promptStatusSchema).optional(),
        distStatus: z.array(promptStatusSchema).optional()
      }
    },
    async input => {
      try {
        const promptOptions: ListPromptsOptions = {
          ...createPromptServiceOptions(input.workspaceDir),
          ...input.kinds != null ? {kinds: input.kinds} : {},
          ...input.query != null ? {query: input.query} : {},
          ...input.enStatus != null ? {enStatus: input.enStatus} : {},
          ...input.distStatus != null ? {distStatus: input.distStatus} : {}
        }
        const prompts = await getSdkBinding().listPrompts(promptOptions)

        return buildSuccessResult({prompts})
      }
      catch (error) {
        return buildErrorResult(error)
      }
    }
  )
}

function registerGetPromptTool(server: McpServer): void {
  server.registerTool(
    'get_prompt',
    {
      title: 'Get Prompt',
      description: 'Read a single managed prompt and return its source and dist artifacts.',
      inputSchema: {
        ...workspaceInputSchema,
        promptId: z.string().min(1)
      }
    },
    async input => {
      try {
        const prompt = await getSdkBinding().getPrompt(input.promptId, createPromptServiceOptions(input.workspaceDir))

        return buildSuccessResult({prompt})
      }
      catch (error) {
        return buildErrorResult(error)
      }
    }
  )
}

function registerUpsertPromptSrcTool(server: McpServer): void {
  server.registerTool(
    'upsert_prompt_src',
    {
      title: 'Upsert Prompt Source',
      description: 'Create or update zh/en source prompt files without touching dist.',
      inputSchema: {
        ...workspaceInputSchema,
        promptId: z.string().min(1),
        locale: localeSchema.optional(),
        content: z.string()
      }
    },
    async input => {
      try {
        const prompt = await getSdkBinding().upsertPromptSource({
          ...createPromptServiceOptions(input.workspaceDir),
          promptId: input.promptId,
          content: input.content,
          ...input.locale != null ? {locale: input.locale} : {}
        })

        return buildSuccessResult({prompt})
      }
      catch (error) {
        return buildErrorResult(error)
      }
    }
  )
}

function registerApplyPromptTranslationTool(server: McpServer): void {
  server.registerTool(
    'apply_prompt_translation',
    {
      title: 'Apply Prompt Translation',
      description: 'Write externally generated en source and optional dist prompt content.',
      inputSchema: {
        ...workspaceInputSchema,
        promptId: z.string().min(1),
        enContent: z.string().optional(),
        distContent: z.string().optional()
      }
    },
    async input => {
      try {
        validateTranslationPayload(input)

        const prompt = await getSdkBinding().writePromptArtifacts({
          ...createPromptServiceOptions(input.workspaceDir),
          promptId: input.promptId,
          ...input.enContent != null ? {enContent: input.enContent} : {},
          ...input.distContent != null ? {distContent: input.distContent} : {}
        })

        return buildSuccessResult({prompt})
      }
      catch (error) {
        return buildErrorResult(error)
      }
    }
  )
}

export function createMemorySyncMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_PACKAGE_NAME,
    version: MCP_VERSION
  })

  registerListPromptsTool(server)
  registerGetPromptTool(server)
  registerUpsertPromptSrcTool(server)
  registerApplyPromptTranslationTool(server)

  return server
}

export async function runMemorySyncMcpStdioServer(): Promise<void> {
  const server = createMemorySyncMcpServer()
  const transport = new StdioServerTransport()

  await server.connect(transport)
}
