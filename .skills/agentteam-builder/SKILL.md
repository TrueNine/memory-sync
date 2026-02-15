---
name: agentteam-builder
description: Guide for writing Agent Teams configs. Teaches how to organise parallel collaboration using Team Lead + Teammates. Activate when creating Agent Teams configs or authoring team collaboration tasks.
displayName: Agent Team Builder
keywords:
  - agent-teams
  - team-lead
  - teammates
  - parallel
  - collaboration
  - claude-code
author: TrueNine
version: 2026.02.14
---
# Agent Team Builder

> **⚠️ Experimental Feature**: Agent Teams is an experimental Claude Code feature. Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Supported only in Anthropic Claude Code.

## Core Constraints (Primacy)

**MUST follow**:

- Claude Code only; other AI Agents do not support it
- Enable via: `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Team Lead coordinates; Teammates execute concrete tasks
- Each Teammate should edit different files to avoid conflicts
- Moderate task granularity: too small wastes coordination overhead; too large loses parallel benefits

**Agent Teams vs Subagents**:

| Dimension     | Subagents                                    | Agent Teams                                              |
| :------------ | :------------------------------------------- | :------------------------------------------------------- |
| Context       | Isolated context, results returned to caller | Isolated context, fully independent execution            |
| Communication | Reports to main Agent only                   | Teammates can communicate directly                       |
| Best for      | Focused tasks that need only results         | Complex work requiring discussion and collaboration      |
| Use cases     | Translation, search, single validation       | Multi-module development, competing-hypothesis debugging |

**Selection guide**:

- Need parallel exploration of multiple approaches? → Agent Teams
- Need cross-layer collaboration (frontend/backend/test)? → Agent Teams
- Single task with result return only? → Subagents

---

## On-Demand Loading

### When to Use Agent Teams

**Recommended**:

- **Research and Review**: Parallel multi-angle exploration, e.g. evaluating several technical options
- **New Modules/Features**: Independent module development, no mutual interference
- **Debugging with Competing Hypotheses**: Test different fault hypotheses in parallel
- **Cross-layer Coordination**: Frontend, backend, test coordination across layers

**Not recommended**:

- Simple single-file edits
- Linearly dependent task chains
- Work requiring frequent state sync

### Team Lead Authoring Guide

Team Lead responsibilities:

1. **Task decomposition**: Split large tasks into parallel sub-tasks
2. **Teammate assignment**: Assign each sub-task to an executor
3. **Resource planning**: Ensure Teammates edit different files
4. **Result integration**: Collect Teammate outputs and verify uniformly

Team Lead prompt structure:

```
## Goal
[Overall goal description]

## Teammates Assignment
- Teammate A: [Task A, owns file X]
- Teammate B: [Task B, owns file Y]
- Teammate C: [Task C, owns file Z]

## Coordination Rules
- File boundaries: [Define each Teammate's editable file scope]
- Dependencies: [Execution order if any]
- Merge strategy: [How results are combined]
```

### Teammate Collaboration Mode

Teammate authoring principles:

1. **Sufficient context**: Provide enough background; Teammates cannot access Team Lead's full context
2. **Clear boundaries**: Explicit scope to avoid out-of-scope changes
3. **Explicit deliverables**: Define expected output format

Teammate prompt structure:

```
## Context
[Relevant background]

## Task
[Concrete task description]

## Scope
- Editable files: [File list]
- Prohibited: [Boundary limits]

## Expected Output
[Deliverable format]
```

### Best Practices

**DO**:

- ✅ Give Teammates enough context (they do not see your full session)
- ✅ Moderate task size (parallelisable but not over-fragmented)
- ✅ Each Teammate edits different files
- ✅ Monitor Teammate progress regularly
- ✅ Intervene at key points to guide

**DON'T**:

- ❌ Assume Teammates share context
- ❌ Let multiple Teammates edit the same file
- ❌ Split tasks too finely (coordination overhead > parallel gain)
- ❌ Leave Teammates unattended (guide when needed)

---

## Validation Checklist (Recency)

After writing Agent Teams config, verify:

- [ ] Env var `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set
- [ ] Using Claude Code (not another AI Agent)
- [ ] Team Lead responsibilities clear (decompose, assign, integrate)
- [ ] Teammate boundaries explicit, no file conflicts
- [ ] Each Teammate has sufficient context
- [ ] Task granularity moderate (not too large or small)
- [ ] Experimental feature warning included