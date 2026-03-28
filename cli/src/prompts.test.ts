import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  getPrompt,
  listPrompts,
  resolvePromptDefinition,
  upsertPromptSource,
  writePromptArtifacts
} from './prompts'

const tempDirs: string[] = []

function createTempWorkspace(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function writeFile(filePath: string, content: string, modifiedAt: Date): void {
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  fs.writeFileSync(filePath, content, 'utf8')
  fs.utimesSync(filePath, modifiedAt, modifiedAt)
}

function serviceOptions(workspaceDir: string) {
  return {
    loadUserConfig: false,
    pluginOptions: {
      workspaceDir
    }
  } as const
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true})
})

describe('prompt catalog service', () => {
  it('lists every managed prompt family with status metadata', async () => {
    const workspaceDir = createTempWorkspace('tnmsc-prompts-')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const now = Date.now()

    writeFile(
      path.join(aindexDir, 'global.src.mdx'),
      '---\ndescription: global zh\n---\nGlobal zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'global.mdx'),
      '---\ndescription: global en\n---\nGlobal en',
      new Date(now - 10_000)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'global.mdx'),
      '---\ndescription: global dist\n---\nGlobal dist',
      new Date(now - 10_000)
    )

    writeFile(
      path.join(aindexDir, 'workspace.src.mdx'),
      '---\ndescription: workspace zh\n---\nWorkspace zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'workspace.mdx'),
      '---\ndescription: workspace en\n---\nWorkspace en',
      new Date(now + 1_000)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'workspace.mdx'),
      '---\ndescription: workspace dist\n---\nWorkspace dist',
      new Date(now + 1_000)
    )

    writeFile(
      path.join(aindexDir, 'app', 'project-a', 'agt.src.mdx'),
      '---\ndescription: project zh\n---\nProject zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'app', 'project-a', 'agt.mdx'),
      '---\ndescription: project en\n---\nProject en',
      new Date(now + 1_000)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'app', 'project-a', 'agt.mdx'),
      '---\ndescription: project dist\n---\nProject dist',
      new Date(now + 1_000)
    )

    writeFile(
      path.join(aindexDir, 'app', 'project-b', 'docs', 'agt.mdx'),
      '---\ndescription: child legacy zh\n---\nChild legacy zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'app', 'project-b', 'docs', 'agt.mdx'),
      '---\ndescription: child dist\n---\nChild dist',
      new Date(now + 1_000)
    )

    writeFile(
      path.join(aindexDir, 'ext', 'project-a', 'agt.src.mdx'),
      '---\ndescription: ext project zh\n---\nExt project zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'ext', 'project-a', 'agt.mdx'),
      '---\ndescription: ext project dist\n---\nExt project dist',
      new Date(now + 1_000)
    )

    writeFile(
      path.join(aindexDir, 'arch', 'system-a', 'agt.src.mdx'),
      '---\ndescription: arch project zh\n---\nArch project zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'arch', 'system-a', 'agt.mdx'),
      '---\ndescription: arch project dist\n---\nArch project dist',
      new Date(now + 1_000)
    )

    writeFile(
      path.join(aindexDir, 'skills', 'reviewer', 'skill.src.mdx'),
      '---\ndescription: skill zh\n---\nSkill zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'skills', 'reviewer', 'skill.mdx'),
      '---\ndescription: skill en\n---\nSkill en',
      new Date(now + 1_000)
    )
    writeFile(
      path.join(aindexDir, 'skills', 'reviewer', 'guide.src.mdx'),
      '---\ndescription: guide zh\n---\nGuide zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'skills', 'reviewer', 'skill.mdx'),
      '---\ndescription: skill dist\n---\nSkill dist',
      new Date(now + 1_000)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'skills', 'reviewer', 'guide.mdx'),
      '---\ndescription: guide dist\n---\nGuide dist',
      new Date(now + 1_000)
    )

    writeFile(
      path.join(aindexDir, 'commands', 'dev', 'build.src.mdx'),
      '---\ndescription: command zh\n---\nCommand zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'commands', 'dev', 'build.mdx'),
      '---\ndescription: command dist\n---\nCommand dist',
      new Date(now + 1_000)
    )

    writeFile(
      path.join(aindexDir, 'subagents', 'qa', 'boot.src.mdx'),
      '---\nname: boot\ndescription: subagent zh\n---\nSubagent zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'subagents', 'qa', 'boot.mdx'),
      '---\nname: boot\ndescription: subagent en\n---\nSubagent en',
      new Date(now + 1_000)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'subagents', 'qa', 'boot.mdx'),
      '---\nname: boot\ndescription: subagent dist\n---\nSubagent dist',
      new Date(now + 1_000)
    )

    writeFile(
      path.join(aindexDir, 'rules', 'frontend.src.mdx'),
      '---\ndescription: rule zh\nglobs: ["src/**"]\n---\nRule zh',
      new Date(now)
    )
    writeFile(
      path.join(aindexDir, 'dist', 'rules', 'frontend.mdx'),
      '---\ndescription: rule dist\nglobs: ["src/**"]\n---\nRule dist',
      new Date(now + 1_000)
    )

    const prompts = await listPrompts(serviceOptions(workspaceDir))

    expect(prompts.map(prompt => prompt.promptId)).toEqual([
      'command:dev/build',
      'global-memory',
      'project-child-memory:app/project-b/docs',
      'project-memory:app/project-a',
      'project-memory:arch/system-a',
      'project-memory:ext/project-a',
      'rule:frontend',
      'skill-child-doc:reviewer/guide',
      'skill:reviewer',
      'subagent:qa/boot',
      'workspace-memory'
    ])
    expect(prompts.find(prompt => prompt.promptId === 'global-memory')).toEqual(expect.objectContaining({enStatus: 'stale', distStatus: 'stale'}))
    expect(prompts.find(prompt => prompt.promptId === 'workspace-memory')).toEqual(expect.objectContaining({enStatus: 'ready', distStatus: 'ready'}))
    expect(prompts.find(prompt => prompt.promptId === 'project-child-memory:app/project-b/docs')).toEqual(expect.objectContaining({
      legacyZhSource: true,
      enStatus: 'missing',
      distStatus: 'ready'
    }))
    expect(prompts.find(prompt => prompt.promptId === 'project-memory:ext/project-a')).toEqual(expect.objectContaining({
      logicalName: 'ext/project-a',
      distStatus: 'ready'
    }))
    expect(prompts.find(prompt => prompt.promptId === 'command:dev/build')).toEqual(expect.objectContaining({enStatus: 'missing', distStatus: 'ready'}))

    const filtered = await listPrompts({
      ...serviceOptions(workspaceDir),
      kinds: ['project-memory'],
      distStatus: ['ready']
    })

    expect(filtered.map(prompt => prompt.promptId)).toEqual([
      'project-memory:app/project-a',
      'project-memory:arch/system-a',
      'project-memory:ext/project-a'
    ])
  })

  it('returns prompt contents and expected paths', async () => {
    const workspaceDir = createTempWorkspace('tnmsc-prompt-details-')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const modifiedAt = new Date()

    writeFile(
      path.join(aindexDir, 'skills', 'reviewer', 'skill.src.mdx'),
      '---\ndescription: skill zh\n---\nSkill zh',
      modifiedAt
    )
    writeFile(
      path.join(aindexDir, 'skills', 'reviewer', 'skill.mdx'),
      '---\ndescription: skill en\n---\nSkill en',
      modifiedAt
    )
    writeFile(
      path.join(aindexDir, 'dist', 'skills', 'reviewer', 'skill.mdx'),
      '---\ndescription: skill dist\n---\nSkill dist',
      modifiedAt
    )

    const prompt = await getPrompt('skill:reviewer', serviceOptions(workspaceDir))
    const resolvedPaths = await resolvePromptDefinition('skill:reviewer', serviceOptions(workspaceDir))

    expect(prompt).toEqual(expect.objectContaining({
      promptId: 'skill:reviewer',
      frontMatter: expect.objectContaining({description: 'skill zh'})
    }))
    expect(prompt?.src.zh?.content).toContain('Skill zh')
    expect(prompt?.src.en?.content).toContain('Skill en')
    expect(prompt?.dist?.content).toContain('Skill dist')
    expect(resolvedPaths).toEqual(prompt?.paths)
  })

  it('migrates legacy project memory to the new zh/en source convention', async () => {
    const workspaceDir = createTempWorkspace('tnmsc-project-migration-')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const legacyPath = path.join(aindexDir, 'app', 'project-c', 'agt.mdx')

    writeFile(
      legacyPath,
      '---\ndescription: legacy zh\n---\nLegacy zh',
      new Date()
    )

    const migrated = await upsertPromptSource({
      ...serviceOptions(workspaceDir),
      promptId: 'project-memory:project-c',
      locale: 'en',
      content: '---\ndescription: translated en\n---\nTranslated en'
    })

    expect(fs.readFileSync(path.join(aindexDir, 'app', 'project-c', 'agt.src.mdx'), 'utf8')).toContain('Legacy zh')
    expect(fs.readFileSync(legacyPath, 'utf8')).toContain('Translated en')
    expect(migrated.promptId).toBe('project-memory:app/project-c')
    expect(migrated.src.zh?.legacySource).toBeUndefined()
    expect(migrated.src.en?.content).toContain('Translated en')

    const rewritten = await upsertPromptSource({
      ...serviceOptions(workspaceDir),
      promptId: 'project-memory:project-c',
      locale: 'zh',
      content: '---\ndescription: rewritten zh\n---\nRewritten zh'
    })

    expect(fs.readFileSync(path.join(aindexDir, 'app', 'project-c', 'agt.src.mdx'), 'utf8')).toContain('Rewritten zh')
    expect(fs.existsSync(legacyPath)).toBe(false)
    expect(rewritten.exists.en).toBe(false)
  })

  it('accepts legacy app project IDs while resolving to series-aware paths', async () => {
    const workspaceDir = createTempWorkspace('tnmsc-project-legacy-id-')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const modifiedAt = new Date()

    writeFile(
      path.join(aindexDir, 'app', 'project-a', 'agt.src.mdx'),
      '---\ndescription: project zh\n---\nProject zh',
      modifiedAt
    )
    writeFile(
      path.join(aindexDir, 'dist', 'app', 'project-a', 'agt.mdx'),
      '---\ndescription: project dist\n---\nProject dist',
      modifiedAt
    )

    const prompt = await getPrompt('project-memory:project-a', serviceOptions(workspaceDir))
    const resolvedPaths = await resolvePromptDefinition('project-memory:project-a', serviceOptions(workspaceDir))

    expect(prompt?.promptId).toBe('project-memory:app/project-a')
    expect(resolvedPaths.zh).toBe(path.join(aindexDir, 'app', 'project-a', 'agt.src.mdx'))
    expect(resolvedPaths.dist).toBe(path.join(aindexDir, 'dist', 'app', 'project-a', 'agt.mdx'))
  })

  it('writes translation artifacts independently for en and dist', async () => {
    const workspaceDir = createTempWorkspace('tnmsc-translation-write-')
    const aindexDir = path.join(workspaceDir, 'aindex')

    writeFile(
      path.join(aindexDir, 'commands', 'dev', 'ship.src.mdx'),
      '---\ndescription: ship zh\n---\nShip zh',
      new Date()
    )

    const afterEnWrite = await writePromptArtifacts({
      ...serviceOptions(workspaceDir),
      promptId: 'command:dev/ship',
      enContent: '---\ndescription: ship en\n---\nShip en'
    })

    expect(afterEnWrite.src.en?.content).toContain('Ship en')
    expect(afterEnWrite.distStatus).toBe('missing')

    const afterDistWrite = await writePromptArtifacts({
      ...serviceOptions(workspaceDir),
      promptId: 'command:dev/ship',
      distContent: '---\ndescription: ship dist\n---\nShip dist'
    })

    expect(afterDistWrite.dist?.content).toContain('Ship dist')
    expect(afterDistWrite.distStatus).toBe('ready')
  })
})
