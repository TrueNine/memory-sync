# Kiro

> Official docs: [kiro.dev/docs](https://kiro.dev/docs)
> GitHub: [github.com/kirodotdev](https://github.com/kirodotdev)

## Overview

Kiro is AWS's intelligent IDE, core feature is **Spec-Driven Development**.

**MUST web search for latest docs**: Kiro in rapid iteration, features change frequently.

## Core Features

### Spec Workflow

Kiro's unique structured dev flow:

```
Requirements (requirements.md) → Design (design.md) → Tasks (tasks.md) → Implementation
```

- **Requirements**: EARS pattern + INCOSE quality rules
- **Design**: Architecture design + correctness properties (Property-Based Testing)
- **Tasks**: Executable implementation checklist

### System Prompt (Steering)

Location: `.kiro/steering/*.md`

```yaml
# Three inclusion modes
inclusion: always      # Always include
inclusion: fileMatch   # Include on file match
inclusion: manual      # Manual # reference
```

### Hooks

Automation triggers:

- On message send
- On execution complete
- On session create
- On file save

### MCP Support

Config location: `.kiro/settings/mcp.json`

```json
{
  "mcpServers": {
    "server-name": {
      "command": "uvx",
      "args": ["package@latest"],
      "disabled": false
    }
  }
}
```

## Context Injection

| Syntax | Purpose |
| :--- | :--- |
| #File | Reference single file |
| #Folder | Reference folder |
| #Problems | Current file problems |
| #Terminal | Terminal output |
| #Git Diff | Git diff |
| #Codebase | Full codebase search |

## Prompt Migration

**From Kiro**: Steering → CLAUDE.md/AGENTS.md, Specs → manual design docs, Hooks → CI/scripts

**To Kiro**: CLAUDE.md → `.kiro/steering/`, manual planning → Spec workflow
