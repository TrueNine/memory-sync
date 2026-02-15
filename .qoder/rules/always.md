---
trigger: always_on
type: user_command
---
# memory-sync

Cross-AI tool prompt synchronization CLI, enabling one rule set for multi-platform adaptation. Monorepo architecture based on pnpm + Turbo.

**Type**
CLI Tool / Monorepo

**Tech Stack**

- Node.js >= 25.2.1
- TypeScript 5.9.3
- pnpm 10.28.0 (package manager)
- Turbo 2.5.3 (build system)
- Vitest 4.0.18 (test framework)
- tsdown 0.20.1 (bundler, CLI core package)
- Tauri 2 (GUI desktop application)

**Directory Structure**

- `cli/`: Core CLI package (command `tnmsc`, Input → Output plugin pipeline architecture)
- `gui/`: Tauri 2 desktop application (React 19 + Rust, graphical frontend for CLI)
- `packages/`: Shared packages
- `pnpm-workspace.yaml`: Workspace configuration
- `turbo.json`: Build task configuration

**Core Architecture**

CLI tool (`tnmsc`) uses **Input → Transform → Output** plugin pipeline:

- Input plugins: Read source files (global memory, skills, fast commands, sub-agents, project prompts, workspace groups)
- Output plugins: Write to target formats (Cursor, Kiro, Warp, Claude CLI, Gemini CLI, Codex CLI, etc.)

**Monorepo Conventions**

- Inter-package dependencies via workspace protocol (`workspace:*`)
- Turbo task dependencies: `test` → `build` → upstream `build`
- Cache outputs: `build` caches `dist/**`
- Single package run: `pnpm -F <package> run <script>`
- Full run: `turbo run <task>`

**Code Style**

- TypeScript strict mode, prefer `readonly` and immutable data
- Use `type` for type aliases, `interface` for object shapes
- Functional programming: `map`/`filter`/`reduce`, avoid side effects
- Cross-platform path handling (`node:path`), support variable substitution (`$WORKSPACE`, `$SHADOW_PROJECT`, `~`)

**Configuration**

- Priority: Programmatic options > CWD `.tnmsc.json` > global `~/.aindex/.tnmsc.json` > defaults
- Merge strategy: Array concatenation, object deep merge, primitive value override

**Version Format**

`YYYY.1MMDD.PATCH` (e.g., `2026.10125.0`)

**Constraints**

- Never modify source files, only read and transform
- Cross-platform compatibility (Windows, macOS, Linux)
- Maintain backward compatibility for configuration files
- CLI supports `npx`, global installation, direct execution