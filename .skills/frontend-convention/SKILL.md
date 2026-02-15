---
name: frontend-convention
description: Frontend development standards covering React/TSX component patterns and ESLint error fixing. Use when writing React components or handling lint errors.
displayName: Frontend Convention
keywords:
  - react
  - tsx
  - component
  - modular
  - pattern
  - frontend
  - eslint
  - lint
  - typescript
  - fix
  - format
  - code-style
author: TrueNine
version: 1.0.0
---
## Spec Overview

| Spec                   | Use Case                                  | Details                 |
| ---------------------- | ----------------------------------------- | ----------------------- |
| TSX Component Patterns | React component writing, structure design | [tsx.md](tsx.md)       |
| ESLint Fix             | Lint error handling, code style           | [eslint.md](eslint.md) |

## TSX Component Quick Reference

- Declare sub-components as `const` before main component
- Keep each sub-component within 30-40 lines
- Main component handles orchestration, sub-components handle details
- Use semantic naming (`VideoOverlay`, `ActionButton`)

## ESLint Quick Reference

- **Run `pnpm lint` first** for auto-fix
- `void 0` instead of `undefined`
- Comments above statements, no trailing comments
- `??` instead of `||` for nullish handling
- **Do NOT modify** eslint config unless necessary