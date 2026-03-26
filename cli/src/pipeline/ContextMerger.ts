/**
 * Context Merger Module
 * Handles merging of partial InputCollectedContext objects
 */

import type { InputCollectedContext, Workspace } from "../plugins/plugin-core";

/**
 * Merge strategy types for context fields
 */
type MergeStrategy = "concat" | "override" | "mergeProjects";

/**
 * Field merge configuration
 */
interface FieldConfig<T> {
  readonly strategy: MergeStrategy;
  readonly getter: (ctx: Partial<InputCollectedContext>) => T | undefined;
}

/**
 * Merge configuration for all InputCollectedContext fields
 */
const FIELD_CONFIGS: Record<string, FieldConfig<unknown>> = {
  workspace: {
    strategy: "mergeProjects",
    getter: (ctx) => ctx.workspace,
  },
  vscodeConfigFiles: {
    strategy: "concat",
    getter: (ctx) => ctx.vscodeConfigFiles,
  },
  zedConfigFiles: {
    strategy: "concat",
    getter: (ctx) => ctx.zedConfigFiles,
  },
  jetbrainsConfigFiles: {
    strategy: "concat",
    getter: (ctx) => ctx.jetbrainsConfigFiles,
  },
  editorConfigFiles: {
    strategy: "concat",
    getter: (ctx) => ctx.editorConfigFiles,
  },
  commands: {
    strategy: "concat",
    getter: (ctx) => ctx.commands,
  },
  subAgents: {
    strategy: "concat",
    getter: (ctx) => ctx.subAgents,
  },
  skills: {
    strategy: "concat",
    getter: (ctx) => ctx.skills,
  },
  rules: {
    strategy: "concat",
    getter: (ctx) => ctx.rules,
  },
  aiAgentIgnoreConfigFiles: {
    strategy: "concat",
    getter: (ctx) => ctx.aiAgentIgnoreConfigFiles,
  },
  readmePrompts: {
    strategy: "concat",
    getter: (ctx) => ctx.readmePrompts,
  },
  globalMemory: {
    // Override fields (last one wins)
    strategy: "override",
    getter: (ctx) => ctx.globalMemory,
  },
  aindexDir: {
    strategy: "override",
    getter: (ctx) => ctx.aindexDir,
  },
  globalGitIgnore: {
    strategy: "override",
    getter: (ctx) => ctx.globalGitIgnore,
  },
  shadowGitExclude: {
    strategy: "override",
    getter: (ctx) => ctx.shadowGitExclude,
  },
} as const;

/**
 * Merge two arrays by concatenating them
 */
function mergeArrays<T>(
  base: readonly T[] | undefined,
  addition: readonly T[] | undefined,
): readonly T[] {
  if (addition == null) return base ?? [];
  if (base == null) return addition;
  return [...base, ...addition];
}

/**
 * Merge workspace projects. Later projects with the same name replace earlier ones.
 */
function mergeWorkspaceProjects(
  base: Workspace,
  addition: Workspace,
): Workspace {
  const projectMap = new Map<string | undefined, (typeof base.projects)[0]>();
  for (const project of base.projects) projectMap.set(project.name, project);
  for (const project of addition.projects)
    projectMap.set(project.name, project);
  return {
    directory: addition.directory ?? base.directory,
    projects: [...projectMap.values()],
  };
}

/**
 * Merge workspace fields
 */
function mergeWorkspace(
  base: Workspace | undefined,
  addition: Workspace | undefined,
): Workspace | undefined {
  if (addition == null) return base;
  if (base == null) return addition;
  return mergeWorkspaceProjects(base, addition);
}

/**
 * Merge a single field based on its strategy
 */
function mergeField<T>(
  base: T | undefined,
  addition: T | undefined,
  strategy: MergeStrategy,
): T | undefined {
  switch (strategy) {
    case "concat":
      return mergeArrays(
        base as unknown[],
        addition as unknown[],
      ) as unknown as T;
    case "override":
      return addition ?? base;
    case "mergeProjects":
      return mergeWorkspace(
        base as unknown as Workspace,
        addition as unknown as Workspace,
      ) as unknown as T;
    default:
      return addition ?? base;
  }
}

/**
 * Merge two partial InputCollectedContext objects
 * Uses configuration-driven approach to reduce code duplication
 */
export function mergeContexts(
  base: Partial<InputCollectedContext>,
  addition: Partial<InputCollectedContext>,
): Partial<InputCollectedContext> {
  const result: Record<string, unknown> = {};

  for (const [fieldName, config] of Object.entries(FIELD_CONFIGS)) {
    // Process each configured field
    const baseValue = config.getter(base);
    const additionValue = config.getter(addition);
    const mergedValue = mergeField(baseValue, additionValue, config.strategy);
    if (mergedValue != null) result[fieldName] = mergedValue;
  }

  return result as Partial<InputCollectedContext>;
}

/**
 * Build dependency context from plugin outputs
 */
export function buildDependencyContext(
  plugin: { dependsOn?: readonly string[] },
  outputsByPlugin: Map<string, Partial<InputCollectedContext>>,
  mergeFn: (
    base: Partial<InputCollectedContext>,
    addition: Partial<InputCollectedContext>,
  ) => Partial<InputCollectedContext>,
): Partial<InputCollectedContext> {
  const deps = plugin.dependsOn ?? [];
  if (deps.length === 0) return {};

  const visited = new Set<string>();
  let merged: Partial<InputCollectedContext> = {};
  for (const depName of deps) {
    if (visited.has(depName)) continue;
    visited.add(depName);
    const depOutput = outputsByPlugin.get(depName);
    if (depOutput != null) merged = mergeFn(merged, depOutput);
  }

  return merged;
}
