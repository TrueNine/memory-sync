# Claude Code CLI

> Official docs: [code.claude.com/claude-code](https://code.claude.com/docs)

## Overview

Claude Code is Anthropic's official CLI coding companion, runs directly in terminal, no IDE required.

**MUST web search for latest docs**: Claude Code updates frequently, commands and features may change.

## Core Features

### Run Modes

```bash
# Interactive mode
claude

# Single execution
claude "task description"

# Pipe input
cat file.py | claude "review this code"
```

### System Prompt (CLAUDE.md)

Priority hierarchy (low → high):

1. `~/.claude/CLAUDE.md` - Global
2. `project-root/CLAUDE.md` - Project level
3. `subdirectory/CLAUDE.md` - Directory level

### File Reference

```bash
# @ syntax for file reference
claude "review @src/main.py"

# Multiple files
claude "compare @file1.py @file2.py"
```

### MCP Support

Config location: `~/.claude/mcp.json` or project-level `.claude/mcp.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem"]
    }
  }
}
```

## Permission Model

```bash
claude --dangerously-skip-permissions  # Auto-approve
claude                                  # Interactive confirm (default)
```

## Common Commands

```bash
claude --help                           # Help
claude --model claude-sonnet-4-20250514 # Specify model
claude --output-format json "task"      # JSON output
claude --continue                       # Continue session
```

## Prompt Migration

**From Claude Code**: CLAUDE.md → Steering/AGENTS.md, @file → #File/relative path

**To Claude Code**: System prompt → CLAUDE.md, ensure plain text no IDE syntax
