import type {Project, RulePrompt} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import {FilePathKind, NamingCaseKind, PromptKind} from '@/types'

export function createMockRulePrompt(
  series: string,
  ruleName: string,
  seriName: string | undefined,
  scope: 'global' | 'project' = 'project'
): RulePrompt {
  const content = '# Rule body'
  const base = {
    type: PromptKind.Rule,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: '.',
      basePath: '',
      getDirectoryName: () => '.',
      getAbsolutePath: () => '.'
    },
    markdownContents: [],
    yamlFrontMatter: {
      description: 'Test rule',
      globs: ['**/*.ts'],
      namingCase: NamingCaseKind.KebabCase
    },
    series,
    ruleName,
    globs: ['**/*.ts'],
    scope
  }

  return seriName != null
    ? {...base, seriName} as RulePrompt
    : base as RulePrompt
}

export function createMockProject(
  name: string,
  basePath: string,
  projectPath: string,
  projectConfig?: unknown
): Project {
  return {
    name,
    dirFromWorkspacePath: {
      pathKind: FilePathKind.Relative,
      path: projectPath,
      basePath,
      getDirectoryName: () => name,
      getAbsolutePath: () => `${basePath}/${projectPath}`
    },
    ...projectConfig != null && {projectConfig: projectConfig as never}
  }
}

export function collectFileNames(results: RelativePath[]): string[] {
  return results.map(r => {
    const parts = r.path.split(/[/\\]/)
    return parts.at(-1) ?? r.path
  })
}
