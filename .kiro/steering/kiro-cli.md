---
inclusion: fileMatch
fileMatchPattern: cli/**
---
# memory-sync Core Package

Core implementation package of the CLI tool, responsible for plugin pipeline, config loading, and command execution. Package name `@truenine/memory-sync`, command `tnmsc`.

**Type**
CLI Core Package

**Directory Structure**

- `src/commands/`: Command implementations (Execute, Clean, DryRun, Init, Set, Help, Version, Outdated)
- `src/plugins/`: Input/Output/Effect plugins
- `src/types/`: TypeScript type definitions
- `src/utils/`: Utility functions
- `src/`: Core modules (ConfigLoader, PluginPipeline, config, constants, log, index)
- `test/`: Test files
- `public/`: Public resources

**Plugin System**

| Category | Description          | Examples                                                                                       |
| -------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| Input    | Read source files    | GlobalMemory, Skill, FastCommand, SubAgent, ProjectPrompt, Workspace, GitIgnore, ShadowProject |
| Output   | Write target formats | WarpIDE, VSCode, JetBrains, ClaudeCode, GeminiCLI, DroidCLI, KiroCLI, CodexCLI, Antigravity    |
| Effect   | Side effect handling | MarkdownWhitespaceCleanup, OrphanFileCleanup, SkillNonSrcFileSync                              |

**Plugin Development**

- Inherit base classes: `AbstractInputPlugin` or `AbstractOutputPlugin`
- Implement methods: `collect()` (Input) or `write()`/`clean()` (Output)
- Declare `name`, `type`, `description`, `dependencies`
- Use `createLogger(name)` to create scoped logger (Winston)

**Pipeline Flow**

1. ConfigLoader merges multi-layer configurations
2. Plugin registration → Dependency resolution → Topological sort
3. Input `collect()` → Output `write()`
4. Plugin failures don't interrupt pipeline, log errors and continue

**Type System**

- `ConfigTypes`: Configuration and merge strategies
- `PluginTypes`: Plugin interfaces, Context, dependency management
- `InputTypes`: GlobalMemory, Skill, FastCommand, SubAgent, ProjectPrompt, Workspace
- `OutputTypes`: Various AI tool output formats
- `PromptTypes`: Frontmatter, Metadata, Content
- `Errors`: CircularDependency, MissingDependency, PluginExecution, ConfigValidation

**Build & Scripts**

- Build: `pnpm -F memory-sync run build` (typecheck + lintfix + tsdown)
- Test: `pnpm -F memory-sync test`
- Publish: `pnpm -F memory-sync run prepublishOnly`

**Constraints**

- Custom error classes provide context information
- Markdown processing uses unified/remark ecosystem (MDX, GFM, Frontmatter)
- Log levels: error, warn, info, debug
- Respect exclusion patterns and external project configurations