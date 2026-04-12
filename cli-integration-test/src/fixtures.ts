import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

export const CONTAINER_HOME_DIR = '/root'
export const CONTAINER_WORKSPACE_DIR = '/workspace'
export const CONTAINER_EXTERNAL_CWD = '/tmp/tnmsc-external'

export interface CodexFixtureOptions {
  readonly seedGlobalSystemSkill?: boolean
  readonly seedGlobalStaleSkill?: boolean
  readonly logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  readonly workspaceLocation?: 'root' | 'home'
  readonly seedWorkspaceGit?: boolean
}

interface FixturePluginFlags {
  readonly codex: boolean
  readonly claudeCode: boolean
  readonly git?: boolean
  readonly readme?: boolean
}

export interface CodexFixture {
  readonly rootDir: string
  readonly homeDir: string
  readonly workspaceDir: string
  readonly outputPaths: {
    readonly globalCommand: string
    readonly workspaceCommand: string
    readonly projectAgent: string
    readonly projectSkill: string
    readonly projectSkillMcp: string
    readonly globalSystemSkill: string
    readonly globalStaleSkill: string
  }
  cleanup: () => void
}

export interface ClaudeCodeFixture {
  readonly rootDir: string
  readonly homeDir: string
  readonly workspaceDir: string
  readonly outputPaths: {
    readonly globalMemory: string
    readonly projectMemory: string
    readonly projectCommand: string
    readonly projectAgent: string
    readonly projectSkill: string
    readonly projectRule: string
    readonly projectSettings: string
    readonly projectSettingsLocal: string
  }
  cleanup: () => void
}

function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, {recursive: true})
}

function writeTextFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath))
  writeFileSync(filePath, content, 'utf8')
}

function writeGlobalConfig(
  homeDir: string,
  plugins: FixturePluginFlags,
  options: {
    readonly workspaceDir: string
    readonly logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  }
): void {
  const configPath = path.join(homeDir, '.aindex', '.tnmsc.json')
  writeTextFile(
    configPath,
    JSON.stringify(
      {
        workspaceDir: options.workspaceDir,
        logLevel: options.logLevel,
        plugins
      },
      null,
      2
    )
  )
}

function writeGlobalMemoryFixtures(workspaceDir: string): void {
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'global.src.mdx'),
    [
      '---',
      'description: 中文全局记忆描述',
      '---',
      '中文全局记忆内容'
    ].join('\n')
  )
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'dist', 'global.mdx'),
    [
      '---',
      'description: English global memory description',
      '---',
      'English global memory body'
    ].join('\n')
  )
}

function writeCommandFixtures(workspaceDir: string): void {
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'commands', 'find', 'opensource.src.mdx'),
    [
      '---',
      'description: 中文源描述',
      'scope: project',
      '---',
      '中文源命令内容'
    ].join('\n')
  )
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'dist', 'commands', 'find', 'opensource.mdx'),
    [
      '---',
      'description: English dist description',
      'scope: project',
      '---',
      'English dist command body'
    ].join('\n')
  )
}

function writeSubAgentFixtures(workspaceDir: string): void {
  const sourceContent = [
    '---',
    'description: 审查变更',
    'scope: project',
    '---',
    '请仔细审查改动。'
  ].join('\n')
  const distContent = [
    '---',
    'description: Review pull requests',
    'scope: project',
    'nickname_candidates:',
    '  - guard',
    'sandbox_mode: workspace-write',
    'mcp_servers:',
    '  docs:',
    '    command: node',
    '    args:',
    '      - mcp.js',
    '---',
    'Review changes carefully.',
    'Focus on concrete regressions.'
  ].join('\n')

  writeTextFile(
    path.join(workspaceDir, 'aindex', 'subagents', 'qa', 'reviewer.src.mdx'),
    sourceContent
  )
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'dist', 'subagents', 'qa', 'reviewer.mdx'),
    distContent
  )
}

function writeSkillFixtures(workspaceDir: string): void {
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'skills', 'ship-it', 'skill.src.mdx'),
    [
      '---',
      'description: 中文技能描述',
      'scope: project',
      '---',
      '中文技能内容'
    ].join('\n')
  )
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'skills', 'ship-it', 'mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          inspector: {
            command: 'npx',
            args: ['inspector']
          }
        }
      },
      null,
      2
    )
  )
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'dist', 'skills', 'ship-it', 'skill.mdx'),
    [
      '---',
      'description: Ship-it skill',
      'scope: project',
      '---',
      'English dist skill body'
    ].join('\n')
  )
}

function writeManagedProjectFixtures(workspaceDir: string): void {
  ensureDir(path.join(workspaceDir, 'project-a'))
  ensureDir(path.join(workspaceDir, 'aindex', 'app', 'project-a'))
  ensureDir(path.join(workspaceDir, 'aindex', 'dist', 'app', 'project-a'))
}

function seedWorkspaceGit(workspaceDir: string): void {
  ensureDir(path.join(workspaceDir, '.git'))
}

function writeProjectPromptFixtures(workspaceDir: string): void {
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'app', 'project-a', 'agt.src.mdx'),
    [
      '---',
      'description: 中文项目记忆描述',
      '---',
      '中文项目记忆内容'
    ].join('\n')
  )
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'dist', 'app', 'project-a', 'agt.mdx'),
    [
      '---',
      'description: English project memory description',
      '---',
      'English project memory body'
    ].join('\n')
  )
}

function writeRuleFixtures(workspaceDir: string): void {
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'rules', 'qa', 'safe.src.mdx'),
    [
      '---',
      'scope: project',
      'description: 中文规则描述',
      'globs:',
      '  - "**/*.ts"',
      '---',
      '中文规则内容'
    ].join('\n')
  )
  writeTextFile(
    path.join(workspaceDir, 'aindex', 'dist', 'rules', 'qa', 'safe.mdx'),
    [
      '---',
      'scope: project',
      'description: English rule description',
      'globs:',
      '  - "**/*.ts"',
      '---',
      'English rule body'
    ].join('\n')
  )
}

function seedGlobalCodexSkills(homeDir: string, options: CodexFixtureOptions): void {
  if (options.seedGlobalSystemSkill === true) {
    writeTextFile(
      path.join(homeDir, '.codex', 'skills', '.system', 'SKILL.md'),
      '# preserved system skill\n'
    )
  }

  if (options.seedGlobalStaleSkill === true) {
    writeTextFile(
      path.join(homeDir, '.codex', 'skills', 'stale-skill', 'SKILL.md'),
      '# stale skill\n'
    )
  }
}

export function createCodexFixture(
  options: CodexFixtureOptions = {}
): CodexFixture {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'tnmsc-codex-fixture-'))
  const homeDir = path.join(rootDir, 'home')
  const workspaceLocation = options.workspaceLocation ?? 'root'
  const workspaceDir = workspaceLocation === 'home'
    ? path.join(homeDir, 'workspace')
    : path.join(rootDir, 'workspace')
  const workspaceDirConfig = workspaceLocation === 'home'
    ? '~/workspace'
    : CONTAINER_WORKSPACE_DIR
  const workspaceContainerDir = workspaceLocation === 'home'
    ? path.posix.join(CONTAINER_HOME_DIR, 'workspace')
    : CONTAINER_WORKSPACE_DIR

  writeGlobalConfig(homeDir, {
    codex: true,
    claudeCode: false,
    git: false,
    readme: false
  }, {
    workspaceDir: workspaceDirConfig,
    logLevel: options.logLevel ?? 'warn'
  })
  writeCommandFixtures(workspaceDir)
  writeSubAgentFixtures(workspaceDir)
  writeSkillFixtures(workspaceDir)
  writeManagedProjectFixtures(workspaceDir)
  if (options.seedWorkspaceGit === true) seedWorkspaceGit(workspaceDir)
  seedGlobalCodexSkills(homeDir, options)

  return {
    rootDir,
    homeDir,
    workspaceDir,
    outputPaths: {
      globalCommand: path.posix.join(
        CONTAINER_HOME_DIR,
        '.codex',
        'prompts',
        'find-opensource.md'
      ),
      workspaceCommand: path.posix.join(
        workspaceContainerDir,
        '.codex',
        'prompts',
        'find-opensource.md'
      ),
      projectAgent: path.posix.join(
        workspaceContainerDir,
        'project-a',
        '.codex',
        'agents',
        'qa-reviewer.toml'
      ),
      projectSkill: path.posix.join(
        workspaceContainerDir,
        'project-a',
        '.codex',
        'skills',
        'ship-it',
        'SKILL.md'
      ),
      projectSkillMcp: path.posix.join(
        workspaceContainerDir,
        'project-a',
        '.codex',
        'skills',
        'ship-it',
        'mcp.json'
      ),
      globalSystemSkill: path.posix.join(
        CONTAINER_HOME_DIR,
        '.codex',
        'skills',
        '.system',
        'SKILL.md'
      ),
      globalStaleSkill: path.posix.join(
        CONTAINER_HOME_DIR,
        '.codex',
        'skills',
        'stale-skill',
        'SKILL.md'
      )
    },
    cleanup() {
      rmSync(rootDir, {recursive: true, force: true})
    }
  }
}

export function createClaudeCodeFixture(): ClaudeCodeFixture {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'tnmsc-claude-code-fixture-'))
  const homeDir = path.join(rootDir, 'home')
  const workspaceDir = path.join(rootDir, 'workspace')

  writeGlobalConfig(homeDir, {
    codex: false,
    claudeCode: true,
    git: false,
    readme: false
  }, {
    workspaceDir: CONTAINER_WORKSPACE_DIR,
    logLevel: 'warn'
  })
  writeGlobalMemoryFixtures(workspaceDir)
  writeCommandFixtures(workspaceDir)
  writeSubAgentFixtures(workspaceDir)
  writeSkillFixtures(workspaceDir)
  writeManagedProjectFixtures(workspaceDir)
  writeProjectPromptFixtures(workspaceDir)
  writeRuleFixtures(workspaceDir)

  return {
    rootDir,
    homeDir,
    workspaceDir,
    outputPaths: {
      globalMemory: path.posix.join(
        CONTAINER_HOME_DIR,
        '.claude',
        'CLAUDE.md'
      ),
      projectMemory: path.posix.join(
        CONTAINER_WORKSPACE_DIR,
        'project-a',
        'CLAUDE.md'
      ),
      projectCommand: path.posix.join(
        CONTAINER_WORKSPACE_DIR,
        'project-a',
        '.claude',
        'commands',
        'find-opensource.md'
      ),
      projectAgent: path.posix.join(
        CONTAINER_WORKSPACE_DIR,
        'project-a',
        '.claude',
        'agents',
        'qa-reviewer.md'
      ),
      projectSkill: path.posix.join(
        CONTAINER_WORKSPACE_DIR,
        'project-a',
        '.claude',
        'skills',
        'ship-it',
        'SKILL.md'
      ),
      projectRule: path.posix.join(
        CONTAINER_WORKSPACE_DIR,
        'project-a',
        '.claude',
        'rules',
        'rule-qa-safe.md'
      ),
      projectSettings: path.posix.join(
        CONTAINER_WORKSPACE_DIR,
        'project-a',
        '.claude',
        'settings.json'
      ),
      projectSettingsLocal: path.posix.join(
        CONTAINER_WORKSPACE_DIR,
        'project-a',
        '.claude',
        'settings.local.json'
      )
    },
    cleanup() {
      rmSync(rootDir, {recursive: true, force: true})
    }
  }
}
