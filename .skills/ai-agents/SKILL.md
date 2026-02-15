---
name: ai-agents
description: AI Agent capability index and cross-Agent prompt migration guide. Activate when understanding Agent differences or writing universal prompts.
displayName: AI Agents Index
keywords:
  - kiro
  - claude-code
  - warp
  - codex
  - prompt
  - agent
author: TrueNine
version: 2026.02.08
---
## Core Constraints (Primacy)

**MUST query latest specs online** — AI Agents iterate rapidly; docs may lag behind.

**Quick comparison**: [comparison.md](comparison.md) — Difference cheat sheet, consult first

This index covers the following Agents:

| Agent       | Positioning                  | Detail Doc                                | Official Doc                                                               |
| :---------- | :--------------------------- | :---------------------------------------- | :------------------------------------------------------------------------- |
| Kiro        | AWS, Spec-Driven development | [kiro.md](kiro.md)                       | [kiro.dev/docs](https://kiro.dev/docs)                                     |
| Claude Code | Anthropic CLI                | [claude-code-cli.md](claude-code-cli.md) | [anthropic.com/claude-code](https://www.anthropic.com/claude-code)         |
| Warp        | Intelligent terminal         | [warp.md](warp.md)                       | [docs.warp.dev](https://docs.warp.dev)                                     |
| Codex       | OpenAI CLI Agent             | [codex.md](codex.md)                     | [developers.openai.com/codex/cli](https://developers.openai.com/codex/cli) |

## Concept Mapping

| Concept           | Kiro          | Claude Code | Warp      | Codex     |
| :---------------- | :------------ | :---------- | :-------- | :-------- |
| System Prompt     | Steering      | CLAUDE.md   | Rules     | AGENTS.md |
| Context Injection | #File/#Folder | @file       | @file     | -         |
| Automation        | Hooks         | -           | Workflows | -         |
| Planning Mode     | Specs         | -           | -         | -         |
| MCP Support       | ✅             | ✅           | ❌         | ✅         |

## Prompt Migration Strategy

When writing cross-Agent universal prompts:

1. **System Prompt**: Use Markdown format — all Agents support it
2. **File References**: Use relative paths; avoid Agent-specific syntax (`#`, `@`)
3. **Constraint Expression**: Use universal keywords like MUST/SHOULD/MAY
4. **Example Format**: TOML/YAML preferred over JSON (better token efficiency)

## Selection Guide

| Scenario                   | Recommended | Reason                                                                     |
| :------------------------- | :---------- | :------------------------------------------------------------------------- |
| Large feature dev          | Kiro        | Spec-Driven workflow ensures requirement-design-implementation consistency |
| Quick prototyping/scripts  | Claude Code | CLI direct execution, no IDE needed                                        |
| Terminal enhancement       | Warp        | Native terminal integration, command completion                            |
| Code generation/completion | Codex       | OpenAI models, code generation speciality                                  |

## Verification Checklist (Recency)

MUST check when writing cross-Agent prompts:

1. Have you queried the Agent's latest docs
2. Does the system prompt use universal Markdown format
3. Do file references avoid Agent-specific syntax
4. Have you considered the target Agent's capability boundaries