// import-resolver.ts
// Module resolution for MDX imports (content-based, no file system access)

import type { MdxjsEsm } from 'mdast-util-mdx'
import type { EvaluationScope, ImportInfo, ProcessingContext } from './types'

/**
 * Extracts import information from an mdxjsEsm node.
 */
export function extractImports(node: MdxjsEsm): ImportInfo[] {
  const imports: ImportInfo[] = []
  const program = node.data?.estree

  if (program == null) {
    return imports
  }

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue
    }

    const source = statement.source.value as string
    const info: ImportInfo = {
      source,
      namedImports: new Map(),
      isMdxComponent: source.endsWith('.mdx'),
    }

    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportDefaultSpecifier') {
        info.defaultImport = specifier.local.name
      } else if (specifier.type === 'ImportSpecifier') {
        const imported
          = specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : (specifier.imported as { value: string }).value
        info.namedImports.set(specifier.local.name, imported)
      }
    }

    imports.push(info)
  }

  return imports
}

/**
 * Resolves an import using the provided context.
 * For MDX components, looks up in ctx.components map.
 * For other imports, they should be pre-provided in scope.
 */
export function resolveImport(
  importInfo: ImportInfo,
  _ctx: ProcessingContext,
): EvaluationScope {
  const scope: EvaluationScope = {}

  if (importInfo.isMdxComponent) {
    // MDX components are resolved from ctx.components
    if (importInfo.defaultImport != null && importInfo.defaultImport !== '') {
      // Mark as component reference for later expansion
      scope[importInfo.defaultImport] = { __mdxComponent: importInfo.source }
    }
  }
  // Non-MDX imports (JSON, JS) should be pre-provided in options.scope
  // We don't do file system access here

  return scope
}

/**
 * Gets component name from import source.
 * e.g., "./Lead.mdx" -> "Lead", "components/Header.mdx" -> "Header"
 */
export function getComponentNameFromSource(source: string): string {
  const filename = source.split('/').pop() ?? source
  return filename.replace(/\.mdx$/, '')
}
