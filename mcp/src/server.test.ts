import type {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'
import {afterEach, describe, expect, it} from 'vitest'

const tempDirs: string[] = []
const serverMainPath = fileURLToPath(new URL('./main.ts', import.meta.url))
const tsxPackageJsonPath = fileURLToPath(new URL('../node_modules/tsx/package.json', import.meta.url))
const tsxCliPath = path.join(path.dirname(tsxPackageJsonPath), 'dist', 'cli.mjs')

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function createTransportEnv(homeDir: string): Record<string, string> {
  const envEntries = Object.entries(process.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')

  return {
    ...Object.fromEntries(envEntries),
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CACHE_HOME: path.join(homeDir, '.cache'),
    XDG_CONFIG_HOME: path.join(homeDir, '.config'),
    XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
    XDG_STATE_HOME: path.join(homeDir, '.local', 'state')
  }
}

interface TextContentBlock {
  readonly type: string
  readonly text?: string
}

function getTextBlock(result: unknown): string {
  if (
    typeof result !== 'object'
    || result == null
    || !('content' in result)
    || !Array.isArray(result.content)
  ) {
    throw new Error('Expected content blocks in MCP result')
  }

  const textBlock = result.content
    .find((block): block is TextContentBlock => typeof block === 'object' && block != null && 'type' in block && (block as {type?: unknown}).type === 'text')
  if (textBlock?.text == null) throw new Error('Expected a text content block in MCP result')
  return textBlock.text
}

function parseToolResult<T>(result: unknown): T {
  return JSON.parse(getTextBlock(result)) as T
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true})
})

describe('memory-sync MCP stdio server', () => {
  it('registers all tools and supports prompt source and translation flows', async () => {
    const workspaceDir = createTempDir('tnmsc-mcp-workspace-')
    const homeDir = createTempDir('tnmsc-mcp-home-')
    const client = new Client({
      name: 'memory-sync-mcp-test-client',
      version: '0.0.0'
    })
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxCliPath, serverMainPath],
      cwd: workspaceDir,
      env: createTransportEnv(homeDir),
      stderr: 'pipe'
    })
    let stderrOutput = ''

    transport.stderr?.on('data', (chunk: Buffer | string) => stderrOutput += String(chunk))

    try {
      await client.connect(transport)

      const tools = await client.listTools()
      expect(tools.tools.map(tool => tool.name).sort()).toEqual([
        'apply_prompt_translation',
        'get_prompt',
        'list_prompts',
        'upsert_prompt_src'
      ])
      expect(
        tools.tools.find(tool => tool.name === 'apply_prompt_translation')?.inputSchema.properties
      ).toMatchObject({
        promptId: expect.any(Object),
        enContent: expect.any(Object),
        distContent: expect.any(Object)
      })

      const invalidApplyResult = await client.callTool({
        name: 'apply_prompt_translation',
        arguments: {
          workspaceDir,
          promptId: 'global-memory'
        }
      })
      expect(invalidApplyResult.isError).toBe(true)
      expect(getTextBlock(invalidApplyResult)).toContain('apply_prompt_translation requires enContent or distContent')

      const upsertGlobalResult = await client.callTool({
        name: 'upsert_prompt_src',
        arguments: {
          workspaceDir,
          promptId: 'global-memory',
          content: '---\ndescription: global zh\n---\nGlobal zh'
        }
      })
      const upsertedGlobal = parseToolResult<{prompt: {enStatus: string, distStatus: string}}>(upsertGlobalResult)
      expect(upsertedGlobal.prompt).toMatchObject({
        enStatus: 'missing',
        distStatus: 'missing'
      })

      const missingPromptListResult = await client.callTool({
        name: 'list_prompts',
        arguments: {
          workspaceDir,
          enStatus: ['missing'],
          distStatus: ['missing']
        }
      })
      const missingPromptList = parseToolResult<{prompts: {promptId: string}[]}>(missingPromptListResult)
      expect(missingPromptList.prompts.map(prompt => prompt.promptId)).toEqual(['global-memory'])

      const globalPromptResult = await client.callTool({
        name: 'get_prompt',
        arguments: {
          workspaceDir,
          promptId: 'global-memory'
        }
      })
      const globalPrompt = parseToolResult<{
        prompt: {
          src: {
            zh?: {content?: string}
            en?: {content?: string}
          }
        }
      }>(globalPromptResult)
      expect(globalPrompt.prompt.src.zh?.content).toContain('Global zh')
      expect(globalPrompt.prompt.src.en).toBeUndefined()

      const applyEnglishResult = await client.callTool({
        name: 'apply_prompt_translation',
        arguments: {
          workspaceDir,
          promptId: 'global-memory',
          enContent: '---\ndescription: global en\n---\nGlobal en'
        }
      })
      const globalAfterEnglish = parseToolResult<{
        prompt: {
          enStatus: string
          distStatus: string
          src: {
            en?: {content?: string}
          }
        }
      }>(applyEnglishResult)
      expect(globalAfterEnglish.prompt).toMatchObject({
        enStatus: 'ready',
        distStatus: 'missing'
      })
      expect(globalAfterEnglish.prompt.src.en?.content).toContain('Global en')

      const applyDistResult = await client.callTool({
        name: 'apply_prompt_translation',
        arguments: {
          workspaceDir,
          promptId: 'global-memory',
          distContent: '---\ndescription: global dist\n---\nGlobal dist'
        }
      })
      const globalAfterDist = parseToolResult<{
        prompt: {
          distStatus: string
          dist?: {content?: string}
        }
      }>(applyDistResult)
      expect(globalAfterDist.prompt.distStatus).toBe('ready')
      expect(globalAfterDist.prompt.dist?.content).toContain('Global dist')

      await client.callTool({
        name: 'upsert_prompt_src',
        arguments: {
          workspaceDir,
          promptId: 'command:demo/build',
          content: '---\ndescription: command zh\n---\nCommand zh'
        }
      })
      const applyCommandTranslationResult = await client.callTool({
        name: 'apply_prompt_translation',
        arguments: {
          workspaceDir,
          promptId: 'command:demo/build',
          enContent: '---\ndescription: command en\n---\nCommand en',
          distContent: '---\ndescription: command dist\n---\nCommand dist'
        }
      })
      const commandPrompt = parseToolResult<{
        prompt: {
          promptId: string
          enStatus: string
          distStatus: string
          src: {
            en?: {content?: string}
          }
          dist?: {content?: string}
        }
      }>(applyCommandTranslationResult)
      expect(commandPrompt.prompt).toMatchObject({
        promptId: 'command:demo/build',
        enStatus: 'ready',
        distStatus: 'ready'
      })
      expect(commandPrompt.prompt.src.en?.content).toContain('Command en')
      expect(commandPrompt.prompt.dist?.content).toContain('Command dist')

      const filteredListResult = await client.callTool({
        name: 'list_prompts',
        arguments: {
          workspaceDir,
          kinds: ['command'],
          query: 'demo',
          enStatus: ['ready'],
          distStatus: ['ready']
        }
      })
      const filteredPrompts = parseToolResult<{prompts: {promptId: string}[]}>(filteredListResult)
      expect(filteredPrompts.prompts.map(prompt => prompt.promptId)).toEqual(['command:demo/build'])
    }
    catch (error) {
      if (stderrOutput.trim().length === 0) throw error

      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`${errorMessage}\nMCP stderr:\n${stderrOutput.trim()}`)
    }
    finally {
      await client.close()
    }
  })
})
