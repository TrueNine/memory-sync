# AI Agent Comparison Cheat Sheet

> Quick comparison table to avoid digging into each Agent's docs. Consult detailed docs only for unclear items.

## Core Capability Comparison

| Capability | Kiro | Claude Code | Warp | Codex |
| :--- | :---: | :---: | :---: | :---: |
| Slash Commands | ✅ | ✅ | ✅ | ✅ |
| Subagents | ✅ | ✅ | ❌ | ❌ |
| Skills/Powers | ✅ | ✅ | ❌ | ✅ |
| Spec-Driven | ✅ | ❌ | ❌ | ❌ |
| TODO/Tasks | ✅ | ✅ | ❌ | ❌ |
| MCP | ✅ | ✅ | ✅ | ✅ |
| Hooks/Automation | ✅ | ❌ | Workflows | ❌ |
| Code Editing | ✅ | ✅ | ✅ | ✅ |
| Terminal Execution | ✅ | ✅ | ✅ | ✅ |
| Pipe Input | ❌ | ✅ | ✅ | ✅ |
| Image Input | ✅ | ✅ | ❌ | ✅ |
| Web Search | ✅ | ✅ | ❌ | ✅ |

## System Prompt Comparison

| Agent | Filename | Location | Hierarchy |
| :--- | :--- | :--- | :--- |
| Kiro | `*.md` | `.kiro/steering/` | always/fileMatch/manual |
| Claude Code | `CLAUDE.md` | Project root/subdirectories | Global → Project → Directory |
| Warp | Custom Instructions | Settings panel | Single layer |
| Codex | `AGENTS.md` | Project root | Single layer |

## Context Injection Syntax

| Agent | File Reference | Other |
| :--- | :--- | :--- |
| Kiro | `#File` `#Folder` | `#Problems` `#Terminal` `#Git Diff` `#Codebase` |
| Claude Code | `@file` | - |
| Warp | `@file` | - |
| Codex | No special syntax | - |

## Runtime Environment

| Agent | Type | Model | Sandbox |
| :--- | :--- | :--- | :--- |
| Kiro | IDE | Claude | ❌ |
| Claude Code | CLI | Claude | Optional |
| Warp | Terminal | Multi-model | ❌ |
| Codex | CLI | GPT/o1 | ✅ Enforced |

## Approval Mode

| Agent | Auto Mode | Interactive Mode |
| :--- | :--- | :--- |
| Kiro | Autopilot | Supervised |
| Claude Code | `--dangerously-skip-permissions` | Default |
| Warp | - | Default |
| Codex | `--auto-approve` | Default |

## Unique Features

| Agent | Unique Capability |
| :--- | :--- |
| Kiro | Spec workflow (requirements → design → tasks), Subagents, Powers |
| Claude Code | Native Unix pipe support, session resume (`-c` `-r`) |
| Warp | Block editing, 400+ CLI command completion, terminal-native |
| Codex | o1 reasoning model, enforced sandbox isolation |

## Universal Prompt Migration

When writing cross-Agent prompts:

1. Use Markdown for system prompts — all Agents support it
2. Use relative paths for file references; avoid `#` `@` syntax
3. Use MUST/SHOULD/MAY for constraints
4. Use TOML/YAML for examples (better token efficiency)
