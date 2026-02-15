# ESLint Fix Guidelines

## Fix Workflow

### Step 1: Run Lint Command

Before manual fixes, **MUST run project lint command first**:

```bash
pnpm lint
```

These issues are auto-fixed, **no manual intervention needed**:
- Import order
- Code formatting
- Whitespace/indentation
- Trailing commas

### Step 2: Manually Fix Remaining Errors

## Common Fix Rules

### undefined Replacement

Use `void 0` instead of `undefined`:

```typescript
// bad
const value = undefined

// good
const value = void 0
```

### No Trailing Comments

Comments MUST be above statements, **trailing comments strictly prohibited**:

```typescript
// bad
const name = 'test' // this is name

// good
// this is name
const name = 'test'
```

### Nullish Coalescing

Prefer `??` over `||`:

```typescript
// bad
const value = input || 'default'

// good
const value = input ?? 'default'
```

## Config Files

**Do NOT modify** `eslint.config.js` or `eslint.config.ts` unless necessary.

For config issues, only suggest modifications to user, never directly edit config files.

## Error Troubleshooting Priority

1. Run `pnpm lint` for auto-fix
2. Check violations against above rules
3. Review specific error messages to locate issues
4. For config adjustments, suggest user to modify manually
