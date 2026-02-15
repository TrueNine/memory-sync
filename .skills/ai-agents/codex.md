# Codex (OpenAI)

> Official docs: [developers.openai.com/codex/cli](https://developers.openai.com/codex)
> GitHub: [github.com/openai/codex](https://github.com/openai/codex)
> npm: [@openai/codex](https://www.npmjs.com/package/@openai/codex)

## Overview

Codex is OpenAI's CLI Agent, focused on code generation and automated task execution.

**MUST web search for latest docs**: OpenAI product line changes frequently, Codex features may adjust.

## Core Features

### Run Modes

```bash
# Interactive mode
codex

# Single execution
codex "create a python script that..."

# Specify model
codex --model o1 "task"
```

### System Prompt (AGENTS.md)

Location: Project root `AGENTS.md`

```markdown
# AGENTS.md Example
## Project Constraints
- Use TypeScript
- Follow ESLint rules
- Test coverage > 80%
```

### Sandbox Execution

Codex executes code in isolated environment:

- Network access restricted
- Filesystem isolated
- Clear security boundaries

## Approval Modes

```bash
codex --auto-approve   # Auto execute
codex --suggest-only   # Suggest only
codex                  # Interactive confirm (default)
```

## Unique Features

- **o1 Reasoning Model**: `codex --model o1 "complex task"`
- **Multimodal Input**: `codex --image screenshot.png "implement this UI"`
- **Forced Sandbox**: Network restricted, filesystem isolated

## Configuration

```bash
export OPENAI_API_KEY="sk-..."
```

## Prompt Migration

**From Codex**: AGENTS.md → CLAUDE.md/Steering, note model capability differences

**To Codex**: System prompt → AGENTS.md, ensure compatible with OpenAI model style
