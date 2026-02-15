---
name: coding-convention
description: Universal coding conventions defining format style, design patterns, coding techniques, and prohibited behaviors. Activate when writing or refactoring code.
displayName: Coding Convention
keywords:
  - code-style
  - convention
  - format
  - pattern
  - error-handling
  - guard-clause
  - design-pattern
  - refactor
  - reuse
  - file-management
author: TrueNine
version: 1.0.0
---
## Core Constraints (Primacy)

This convention applies to all programming languages, defining universal code quality standards.

**Core Principles**:

- Clarity over brevity, explicit over implicit
- Reduce nesting, improve readability
- Composition over inheritance, injection over hardcoding
- Transparent error exposure, no suppression
- Reuse over rewrite, extend over create new

**Consult as needed**:

| Document                        | Purpose                                                    |
| :------------------------------ | :--------------------------------------------------------- |
| [format.md](format.md)         | Format style: comments, braces, naming                     |
| [techniques.md](techniques.md) | Coding techniques: Guard Clause, multi-condition branching |
| [patterns.md](patterns.md)     | Design patterns: composition, injection, strategy          |
| [errors.md](errors.md)         | Error handling: transparent exposure, no unwrap            |
| [principles.md](principles.md) | Dev principles: reuse, file management, version strategy   |

## Prohibited Behaviors

| Behavior               | Reason                                  |
| ---------------------- | --------------------------------------- |
| End-of-line comments   | Hard to read, easily missed             |
| Omitting braces        | Error-prone during iteration            |
| Deep nesting (>3)      | Destroys readability                    |
| Suppressing errors     | Loses diagnostic info                   |
| Hardcoded dependencies | Tight coupling, hard to test            |
| Deep inheritance       | Fragile base class problem              |
| unwrap/expect          | Panic risk                              |
| Reinventing the wheel  | Wastes resources, breaks consistency    |
| Downgrading versions   | Misses optimizations and security fixes |

## Verification Checklist (Recency)

After writing code **MUST** check:

1. Comments placed above statements
2. Conditionals/loops use braces
3. Nesting level ≤3
4. Branches ≥3 use match/lookup table
5. Dependencies injected
6. Errors transparently propagated
7. No unwrap/expect present
8. Investigated and reused existing code
9. New files meet independence requirements