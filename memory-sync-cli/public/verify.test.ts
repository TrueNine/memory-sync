/**
 * MDX 语法验证测试
 * 编译 verify.mdx 并输出结果到 verify.testresult.mdx
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mdxToMd } from '../src/compiler'
import type { MdxGlobalScope } from '../src/globals'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VERIFY_INPUT = path.join(__dirname, 'verify.mdx')
const VERIFY_OUTPUT = path.join(__dirname, 'verify.testresult.mdx')

// 模拟全局作用域
const mockGlobalScope: MdxGlobalScope = {
    profile: {
        name: 'TrueNine',
        username: 'truenine',
        gender: 'male',
        birthday: '1990-01-01',
    },
    tool: {
        websearch: 'web_search',
        webfetch: 'web_fetch',
        readFile: 'read_file',
        writeFile: 'write_file',
        executeCommand: 'execute_command',
        todolistWrite: 'todolist_write',
        grep: 'grep_search',
    },
    os: {
        platform: 'linux',
        arch: 'x64',
        hostname: 'dev-machine',
        homedir: '/home/truenine',
        tmpdir: '/tmp',
        type: 'Linux',
        release: '6.1.0',
        shellKind: 'bash' as const,
        kind: 'linux' as const,
    },
    env: {
        NODE_ENV: 'test',
        DEBUG: 'true',
        HOME: '/home/truenine',
    },
}

describe('verify.mdx compilation', () => {
    it('should compile verify.mdx and output to verify.testresult.mdx', async () => {
        // 读取源文件
        const sourceContent = fs.readFileSync(VERIFY_INPUT, 'utf-8')
        expect(sourceContent).toBeTruthy()

        // 编译 MDX
        const result = await mdxToMd(sourceContent, {
            globalScope: mockGlobalScope,
            extractMetadata: true,
            basePath: __dirname,
        })

        // 验证编译结果
        expect(result.content).toBeTruthy()
        expect(result.metadata).toBeDefined()

        // 验证元数据提取
        expect(result.metadata.fields).toHaveProperty('name', 'mdx-syntax-verification')
        expect(result.metadata.fields).toHaveProperty('description')
        expect(result.metadata.fields).toHaveProperty('keywords')

        // 验证复杂 export 提取
        expect(result.metadata.fields).toHaveProperty('VERSION', '1.0.0')
        expect(result.metadata.fields).toHaveProperty('AUTHOR', 'TrueNine')
        expect(result.metadata.fields).toHaveProperty('NUMBERS')
        expect(result.metadata.fields['NUMBERS']).toEqual([1, 2, 3, 4, 5])
        expect(result.metadata.fields).toHaveProperty('CONFIG')
        expect(result.metadata.fields['CONFIG']).toEqual({ debug: true, maxRetries: 3, timeout: 5000 })
        expect(result.metadata.fields).toHaveProperty('NESTED')
        // metadata 对象会被展开
        expect(result.metadata.fields).toHaveProperty('category', 'documentation')
        expect(result.metadata.fields).toHaveProperty('priority', 1)

        // 验证表达式求值
        expect(result.content).toContain('TrueNine') // profile.name
        expect(result.content).toContain('truenine') // profile.username
        expect(result.content).toContain('linux') // os.platform
        expect(result.content).toContain('x64') // os.arch
        expect(result.content).toContain('bash') // os.shellKind

        // 验证工具名称替换
        expect(result.content).toContain('web_search') // tool.websearch
        expect(result.content).toContain('read_file') // tool.readFile

        // 验证条件渲染 - Linux 内容应该存在
        expect(result.content).toContain('Linux 用户须知')
        expect(result.content).toContain('sudo apt-get')

        // 验证条件渲染 - macOS/Windows 内容不应该存在（实际示例部分）
        expect(result.content).not.toContain('macOS 用户须知')
        expect(result.content).not.toContain('Windows 用户须知')
        expect(result.content).not.toContain('安装 Homebrew') // macOS 示例中的具体命令
        expect(result.content).not.toContain('Set-ExecutionPolicy') // Windows 示例中的具体命令

        // 验证 JSX 注释被正确移除（不在代码块中的注释）
        expect(result.content).not.toContain('这段注释不会出现在最终输出中')
        expect(result.content).not.toContain('MDX 语法验证与示范文件')

        // 验证 export 语句被移除（元数据提取时）
        expect(result.content).not.toContain('export const VERSION')
        expect(result.content).not.toContain('export const AUTHOR')

        // 验证 export 的值被提取到 metadata
        expect(result.metadata.fields).toHaveProperty('VERSION', '1.0.0')
        expect(result.metadata.fields).toHaveProperty('AUTHOR', 'TrueNine')

        // 写入结果文件
        const outputContent = buildOutputContent(result.content, result.metadata)
        fs.writeFileSync(VERIFY_OUTPUT, outputContent, 'utf-8')

        // 验证输出文件已创建
        expect(fs.existsSync(VERIFY_OUTPUT)).toBe(true)

        console.log(`✅ 编译成功，结果已写入: ${VERIFY_OUTPUT}`)
    })

    it('should handle all markdown syntax correctly', async () => {
        const sourceContent = fs.readFileSync(VERIFY_INPUT, 'utf-8')
        const result = await mdxToMd(sourceContent, {
            globalScope: mockGlobalScope,
            extractMetadata: true,
        })

        // 验证标准 Markdown 语法保留
        expect(result.content).toContain('# MDX 语法验证与编写指南')
        expect(result.content).toContain('## ')
        expect(result.content).toContain('### ')
        expect(result.content).toContain('**')
        expect(result.content).toContain('*')
        expect(result.content).toContain('```')
        expect(result.content).toContain('|')
        expect(result.content).toContain('- ')
        expect(result.content).toContain('1. ')
        expect(result.content).toContain('> ')
        expect(result.content).toContain('[')
        expect(result.content).toContain('](')
        expect(result.content).toContain('---')
    })

    it('should handle GFM extensions', async () => {
        const sourceContent = fs.readFileSync(VERIFY_INPUT, 'utf-8')
        const result = await mdxToMd(sourceContent, {
            globalScope: mockGlobalScope,
            extractMetadata: true,
        })

        // 验证 GFM 表格
        expect(result.content).toMatch(/\|.*\|.*\|/)

        // 验证任务列表（markdown 输出中方括号被转义）
        expect(result.content).toContain('[x]')
        expect(result.content).toContain('[ ]')

        // 验证删除线
        expect(result.content).toContain('~~')
    })
})

/**
 * 构建输出内容，包含编译信息头
 */
function buildOutputContent(content: string, metadata: { fields: Record<string, unknown>, source: string }): string {
    const header = `---
# 编译结果文件
# 源文件: verify.mdx
# 编译时间: ${new Date().toISOString()}
# 元数据来源: ${metadata.source}
compiled: true
originalName: ${metadata.fields['name'] ?? 'unknown'}
---

`
    return header + content
}
