# TrueNine Life CLI

Cross-platform prompt sync tool for AI coding assistants. One ruleset, multi-target adaptation.

## Quick Start

```bash
npx @truenine/memory-sync-cli
```

## Global Install

```bash
pnpm add -g @truenine/memory-sync-cli
```

## Update

```bash
pnpm update -g @truenine/memory-sync-cli --latest
```

After installation, use directly:

```bash
tnmsc
```

Available commands:

```bash
# Sync directly
tnmsc

# Get help
tnmsc help
tnmsc --help
tnmsc -h

# Init directory structure from config
tnmsc init

# Preview export
tnmsc dry-run

# Clean all exports
tnmsc clean

# Preview clean targets
tnmsc clean --dry-run
tnmsc clean -n

# Set log level
tnmsc --debug
tnmsc --info
tnmsc --warn
tnmsc --error
tnmsc clean --info
tnmsc dry-run --debug
tnmsc clean dry-run --info
```

## CLI Config

Config can be created in two locations. Example shows defaults:

```text
~/.aindex/.tnmsc.json
cwd()/.tnmsc.json
```
> cwd() represents current working directory.

```json
{
  "workspaceDir": "~/project",
  "shadowProjectDir": "$WORKSPACE/aindex",
  "shadowSkillSourceDir": "$SHADOW_PROJECT/dist/skills",
  "shadowFastCommandDir": "$SHADOW_PROJECT/dist/commands",
  "shadowSubAgentDir": "$SHADOW_PROJECT/dist/agents",
  "globalMemoryFile": "$SHADOW_PROJECT/dist/GLOBAL.md",
  "shadowSourceProjectDir": "$SHADOW_PROJECT/ref",
  "externalProjects": [],
  "excludePatterns": {},
  "logLevel": "info"
}
```

## Supported AI Tools

**IDE**
- Cursor IDE
- Kiro IDE
- Windsurf IDE
- Qoder IDE
- CodeBuddy IDE
- Antigravity IDE

**CLI Tools**
- Claude Code CLI
- Codex CLI
- Gemini CLI
- FactoryDroid CLI

**Config Files**
- JetBrains IDE
- VSCode IDE

## Plugin System

Pipeline architecture: input → transform → output

- **Input Plugins**: Read sources (Aindex, Ref, WorkspaceGroup)
- **Transform Plugins**: Process content
- **Output Plugins**: Write target formats (IDE/CLI adapters)

## Config

Priority: `cwd()/.tnmsc.json` > `~/.aindex/.tnmsc.json`

## License

UNLICENSED
