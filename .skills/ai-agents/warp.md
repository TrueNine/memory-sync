# Warp

> Official docs: [docs.warp.dev](https://docs.warp.dev)
> Product page: [warp.dev](https://www.warp.dev)

## Overview

Warp is an AI-enhanced modern terminal, integrating intelligence directly into terminal experience.

**MUST web search for latest docs**: Warp iterates fast, capabilities continuously expanding.

## Core Features

### Command Generation

```bash
# Natural language to command
# Input: "find all python files modified in last 7 days"
# Output: find . -name "*.py" -mtime -7
```

### Warp AI Assistant

- **Command Explanation**: Explain complex command meanings
- **Error Fixing**: Analyse command failure reasons
- **Command Suggestions**: Context-based command recommendations

### Workflows

Reusable command sequences:

```yaml
# ~/.warp/workflows/deploy.yaml
name: Deploy
steps:
  - command: git pull
  - command: npm install
  - command: npm run build
  - command: npm run deploy
```

### File Reference

```bash
warp-ai "explain @config.yaml"
```

## Unique Features

- **Blocks**: Command output organised by blocks, individually copyable/shareable/searchable
- **Smart Completion**: Command/argument/path completion, 400+ CLI support

## Configuration

Location: Warp Settings → AI → Custom Instructions

## Prompt Migration

Warp focuses on terminal operations, doesn't handle code editing. Complex dev tasks need Kiro/Claude Code.
