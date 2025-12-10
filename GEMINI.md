[.scripts/](/.scripts/) provides aindex automation toolchain for prompt sync, export, and project management. Built with TypeScript + pnpm, compiled to ES Module.

## Tech Stack

- **Language**: TypeScript 5.9+, Node.js 25+, pnpm 10.22.0
- **Build**: tsdown (esbuild), vitest, ESLint 9
- **Directories**: `src/` source, `dist/` artifacts, `commands/` commands, `utils/` utilities, `constants/` constants

## Architecture

**Layers**: CLI → Commands → Utils → Constants
- **CLI**: `auto.ts` executes complete workflow
- **Commands**: Independent command implementations (auto, kiro, map, skills, qoder)
- **Utils**: File system, logging, config, templates
- **Constants**: Paths, config, template constants

## Dependencies

**Core**: `@clack/prompts`, `cac`, `execa`, `fast-glob`, `fs-extra`, `winston`, `zod`
**Dev**: `tsdown`, `tsx`, `vitest`, `eslint`

## Entry Points

**Root launch**: `dep` / `dep.bat` / `dep.ps1` → executes `auto.ts` complete workflow

**Core command**: `auto` one-click sync and export
- Clean blank line indentation (`_ai/`, `issues/`, `ref/*/src/`, `ref/*/dist/`)
- Sync `GLOBAL.md` to user directory
- Sync `commands/` to `.claude/commands/`, `.agent/workflows/`, `.windsurf/workflows/`, `.codex/commands/`, `.gemini/commands/`, `.trae/commands/`, `.droid/commands/`
- Sync `agents/` to `.claude/agents/`
- Sync `skills/` to `.claude/skills/`
- Export `GLOBAL.md` to `.kiro/steering/GLOBAL.md`
- Export all `AGENTS.md` to `.kiro/steering/_*.md` (with fileMatch front matter)
- Create `AGENTS.md` → `CLAUDE.md`, `GEMINI.md` symlinks
- Generate `.qoder/rules/_project.md` (Qoder front matter)
- Generate `.codebuddy/.rules/_project.md` (Codebuddy)
- Generate `.agent/rules/_project.md` (antigravity front matter)
- Clean legacy `.cursor/rules/` (Cursor 0.40+ native AGENTS.md support)
- Copy `ref/*/dist/` to external projects, update `.editorconfig`, `.vscode/settings.json`, `.gitignore`

## Utility Layer

**File System** (`utils/fs.ts`): `pathExists`, `copyFile`, `copyDirectory`, `linkOrCopyFile`, `findAgentsFiles`
**Logging** (`utils/log.ts`): `LogAdapter` structured logging, output to `logs/`
**Config** (`utils/config.ts`): `loadConfig`, `saveConfig` (priority: `~/aindex/config.json` > project root `config.json`)
**Templates** (`utils/templates.ts`): `generateRuleFiles` (YAML front matter)
**Others**: `blankLineCleaner`, `dirCleaner`, `fileWalker`, `projectColors`, `vscodeSettings`

**Constants** (`constants/`): `AINDEX_ROOT`, `DIST_ROOT`, `REF_ROOT`, `USER_HOME`, `PROMPT_TARGETS`, `YAML_FRONT_MATTER_*`

## Development

**Install**: `pnpm install`
**Dev**: `pnpm dev` (run TypeScript directly)
**Build**: `pnpm build` (typecheck + lint + compile)
**Test**: `pnpm test`

**Artifacts**: `dist/index.mjs` (auto entry), `dist/*.d.mts` (type declarations), `dist/*.mjs.map` (source map)

## Principles

**Modular**: Clear layers, single responsibility
**Type Safety**: TypeScript strict, zod validation
**Error Handling**: Unified pattern, non-zero exit codes
**Log Tracing**: Structured logs, namespace isolation
**Cross-platform**: Node.js built-in modules

## Supported AI Coding Tools

**Goal**: Seamless switching between AI coding tools, unified prompt management

**Tool Features**:
- **Cursor**: IDE integration, native AGENTS.md support, strong code completion
- **Claude Code**: VSCode extension, supports commands/agents/skills, conversational programming
- **Windsurf**: Workflow-driven, automated task execution
- **Kiro**: Steering mechanism, conditional inclusion rules, fine-grained control
- **Qoder**: Rule-driven, front matter config
- **Codebuddy**: Lightweight rule system
- **Codex**: Command-based interaction
- **Gemini CLI**: Google AI support, CLI tool
- **Trae**: Command-based workflow
- **Droid CLI**: Automated script execution
- **Antigravity**: Rule + workflow hybrid mode

**Commonality**: All support Markdown prompts, command definitions, rule configs
**Differences**: Config paths, front matter formats, feature focus vary

**Switching Strategy**: Deploy to all tools via `auto` command, maintain prompt consistency

## Input Files

**Global source files**: Located in aindex root `dist/`
- `GLOBAL.md`: Global rules
- `commands/*.md`: Global command definitions
- `agents/*.md`: Global agent configs
- `skills/*.md`: Global skill definitions

**Project source files**: Located in `ref/<project>/dist/`
- `AGENTS.md`: Project rules
- `commands/*.md`: Project command definitions
- `agents/*.md`: Project agent configs
- `skills/*.md`: Project skill definitions

**Base configs**: Located in aindex root
- `.vscode/settings.json`: VSCode settings
- `.idea/codeStyles/Project.xml`: IDEA code styles
- `.idea/codeStyles/codeStyleConfig.xml`: IDEA style config
- `.editorconfig`: Editor config
- `.gitattributes`: Git attributes

## Output Targets

**AI Tools**:
- **Cursor**: Native `AGENTS.md` support
- **Claude Code**: `CLAUDE.md` symlink, `.claude/commands/`, `.claude/agents/`, `.claude/skills/`
- **Windsurf**: `.windsurf/workflows/`
- **Kiro**: `.kiro/steering/` (GLOBAL: `inclusion: always`, AGENTS: `inclusion: fileMatch`)
- **Qoder**: `.qoder/rules/_project.md` (Qoder front matter)
- **Codebuddy**: `.codebuddy/.rules/_project.md`
- **Codex**: `.codex/commands/`
- **Gemini CLI**: `GEMINI.md` symlink, `.gemini/commands/`
- **Trae**: `.trae/commands/`
- **Droid CLI**: `.droid/commands/`
- **Antigravity**: `.agent/rules/_project.md` (antigravity front matter), `.agent/workflows/`

**Base project configs**: Deploy to external project corresponding to `ref/<project>`
- `.vscode/settings.json`
- `.idea/codeStyles/Project.xml`
- `.idea/codeStyles/codeStyleConfig.xml`
- `.editorconfig`
- `.gitattributes`

## ref/ Processing Logic

**Directory structure**: `ref/<project-name>/` stores external project mirrors
- `src/`: Project source mirror (read-only, AI context reference)
- `dist/`: Compiled artifacts (generated by aindex, deployed to external project)
- `.doc/`: Confidential docs (AI access and copying prohibited)

**Processing flow**:
1. **Clean**: Clean blank line indentation in `ref/*/src/` and `ref/*/dist/`
2. **Scan**: Traverse `ref/` first-level subdirs, identify external projects
3. **Deploy**: Copy `ref/<project>/dist/` content to configured external project path
4. **Update**: Sync base project configs to external project
5. **Verify**: Check external project path existence, log deployment results

**Config**: Read `~/aindex/config.json` or project root `config.json`

**Constraints**:
- `src/` read-only for AI, no modifications
- `.doc/` strictly prohibited access
- `dist/` generated by toolchain, no manual edits
- Verify target path before deploy, avoid overwriting wrong project

## Notes

**Blank line cleaning**: `blankLineCleaner` removes Markdown blank line indentation, preserves BOM and line endings
**Symlinks**: Linux/macOS prefer symlinks, Windows fallback to copy
**Color config**: `updateVSCodeColors()` sets VSCode title bar color based on project name
