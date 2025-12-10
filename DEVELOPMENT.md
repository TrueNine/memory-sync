# Development Guide

## Overview

This guide explains how to work with the `.scripts` CLI tool, including the directory structure, how to add new commands, and how to run tests.

For architectural details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Directory Structure

```
.scripts/
├── src/
│   ├── cli.ts                    # CLI entry point
│   ├── commands/                 # Command layer
│   │   ├── agentRulesExport.ts
│   │   ├── antigravityExporter.ts
│   │   ├── auto.ts
│   │   ├── config.ts
│   │   ├── depCheck.ts
│   │   ├── depUpdate.ts
│   │   ├── docLink.ts
│   │   ├── init.ts
│   │   ├── kiroAgentsExport.ts
│   │   ├── kiroSteeringExport.ts
│   │   ├── mapAgentsClaude.ts
│   │   ├── projectSelect.ts
│   │   ├── promptBuild.ts
│   │   ├── qoderExport.ts
│   │   ├── skillsSync.ts
│   │   └── __tests__/           # Integration tests
│   ├── services/                 # Service layer
│   │   ├── export/
│   │   │   ├── ExportService.ts
│   │   │   └── __tests__/
│   │   ├── rule/
│   │   │   ├── RuleGeneratorService.ts
│   │   │   └── __tests__/
│   │   └── sync/
│   │       ├── SyncService.ts
│   │       └── __tests__/
│   ├── utils/                    # Utility layer
│   │   ├── blankLineCleaner.ts
│   │   ├── config.ts
│   │   ├── dirCleaner.ts
│   │   ├── errors.ts
│   │   ├── fileWalker.ts
│   │   ├── frontMatter.ts
│   │   ├── fs.ts
│   │   ├── log.ts
│   │   ├── logger.ts
│   │   ├── logMessages.ts
│   │   ├── pathResolver.ts
│   │   ├── projectColors.ts
│   │   ├── ruleGenerator.ts
│   │   ├── templates.ts
│   │   ├── vscodeSettings.ts
│   │   └── __tests__/
│   ├── types/                    # Type definitions
│   │   └── index.ts
│   ├── constants/                # Constants and configuration
│   │   ├── index.ts
│   │   ├── paths.ts
│   │   └── templates.ts
│   └── index.ts                  # Main entry point
├── dist/                         # Compiled output
├── logs/                         # Log files
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Layer Organization

The codebase follows a three-layer architecture:

1. **Command Layer** (`src/commands/`): CLI interaction and orchestration
2. **Service Layer** (`src/services/`): Business logic implementation
3. **Utility Layer** (`src/utils/`): Low-level reusable functions

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed layer responsibilities.

## Available Commands

### Export Commands

Export AGENTS.md files to different AI tool formats:

```bash
# Export to Kiro steering directory
pnpm tn kiro:export

# Export to Qoder rules directory
pnpm tn qoder:export

# Export agents to Kiro agents directory
pnpm tn kiro:agents-export

# Export to Antigravity format
pnpm tn antigravity:export

# Export agent rules
pnpm tn agent:rules-export
```

### Sync Commands

Synchronize files between directories:

```bash
# Sync agents to Claude Code format
pnpm tn map:agents-claude

# Sync skills across AI tool directories
pnpm tn skills:sync
```

### Build Commands

Build and compile prompts:

```bash
# Build prompts from source
pnpm tn prompt:build
```

### Automation Commands

Run multiple operations:

```bash
# Auto-sync all exports and syncs
pnpm tn auto
```

### Configuration Commands

Manage project configuration:

```bash
# Initialize project configuration
pnpm tn init

# Select active project
pnpm tn project:select

# Manage configuration
pnpm tn config
```

### Dependency Commands

Manage dependencies:

```bash
# Check for outdated dependencies
pnpm tn dep:check

# Update dependencies
pnpm tn dep:update
```

## Adding a New Command

Follow these steps to add a new command to the CLI tool:

### 1. Create Command File

Create a new file in `src/commands/<domain>/<action>.ts`:

```typescript
// src/commands/export/newExport.ts
import { getLogger } from '@/utils/logger'
import { ExportService } from '@/services/export/ExportService'
import { FrontMatterType } from '@/utils/frontMatter'

export async function newExportCommand(): Promise<void> {
  const log = getLogger()
  
  try {
    log.info('Starting new export...')
    
    const service = new ExportService()
    const result = await service.exportAgentsFiles({
      sourcePath: process.cwd(),
      targetPath: '.newtool/rules',
      frontMatterType: FrontMatterType.KIRO_ALWAYS,
      skipRoot: false
    })
    
    log.info('Export completed: {} files exported', result.exported)
    
    if (result.errors.length > 0) {
      log.warn('Encountered {} errors', result.errors.length)
      result.errors.forEach(error => log.error(error))
    }
  } catch (error) {
    log.error('Export failed: {}', error)
    process.exitCode = 1
  } finally {
    await log.shutdown()
  }
}
```

### 2. Register Command

Add the command to `src/commands/index.ts`:

```typescript
export { newExportCommand } from './export/newExport'
```

### 3. Wire to CLI

Register in `src/cli.ts`:

```typescript
import { newExportCommand } from './commands'

program
  .command('newtool:export')
  .description('Export AGENTS.md files to NewTool format')
  .action(newExportCommand)
```

### 4. Add Tests

Create integration test in `src/commands/__tests__/newExport.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { newExportCommand } from '../export/newExport'
import { setupTestEnvironment, cleanupTestEnvironment } from './helpers'

describe('newExportCommand', () => {
  beforeEach(async () => {
    await setupTestEnvironment()
  })

  afterEach(async () => {
    await cleanupTestEnvironment()
  })

  it('should export files to newtool directory', async () => {
    await newExportCommand()
    
    // Verify files were created
    expect(fs.existsSync('.newtool/rules/AGENTS.md')).toBe(true)
  })
})
```

### Command Naming Convention

Follow the `domain:action` pattern:

- `export:*` - Export operations
- `sync:*` - Synchronization operations
- `build:*` - Build operations
- `config:*` - Configuration operations
- `dep:*` - Dependency operations

## Adding a New Service

### 1. Create Service Class

Create service in `src/services/<name>/<ServiceName>.ts`:

```typescript
// src/services/transform/TransformService.ts
import { getLogger } from '@/utils/logger'
import { findFiles } from '@/utils/fileWalker'
import { ScriptsError } from '@/utils/errors'

export interface TransformOptions {
  sourcePath: string
  targetPath: string
  transformType: string
}

export interface TransformResult {
  transformed: number
  skipped: number
  errors: string[]
}

export class TransformService {
  private log = getLogger()

  async transformFiles(options: TransformOptions): Promise<TransformResult> {
    this.log.debug('Starting transformation with options: {}', options)
    
    const result: TransformResult = {
      transformed: 0,
      skipped: 0,
      errors: []
    }

    try {
      const files = await findFiles({
        basePath: options.sourcePath,
        fileName: 'AGENTS.md'
      })

      for (const file of files) {
        try {
          await this.transformFile(file, options)
          result.transformed++
        } catch (error) {
          result.errors.push(`Failed to transform ${file.path}: ${error}`)
          result.skipped++
        }
      }

      return result
    } catch (error) {
      throw new ScriptsError(
        'Transformation failed',
        'TRANSFORM_ERROR',
        { options, error }
      )
    }
  }

  private async transformFile(file: FileInfo, options: TransformOptions): Promise<void> {
    // Implementation
  }
}
```

### 2. Add Unit Tests

Create tests in `src/services/<name>/__tests__/<ServiceName>.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { TransformService } from '../TransformService'

describe('TransformService', () => {
  it('should transform files successfully', async () => {
    const service = new TransformService()
    
    const result = await service.transformFiles({
      sourcePath: '/test/source',
      targetPath: '/test/target',
      transformType: 'markdown'
    })
    
    expect(result.transformed).toBeGreaterThan(0)
    expect(result.errors).toHaveLength(0)
  })
})
```

### 3. Use in Commands

Import and use the service in command files:

```typescript
import { TransformService } from '@/services/transform/TransformService'

const service = new TransformService()
const result = await service.transformFiles(options)
```

## Running Tests

### Run All Tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage
```

### Run Specific Test Types

```bash
# Run only unit tests
pnpm test src/utils

# Run only service tests
pnpm test src/services

# Run only integration tests
pnpm test src/commands/__tests__

# Run only property-based tests
pnpm test --grep "property"
```

### Run Specific Test Files

```bash
# Run a specific test file
pnpm test src/utils/__tests__/fileWalker.test.ts

# Run tests matching a pattern
pnpm test --grep "ExportService"
```

### Test Configuration

Tests are configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.property.test.ts'
      ]
    },
    testTimeout: 30000
  }
})
```

### Writing Tests

#### Unit Tests

Test individual functions and classes:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateGlobPattern } from '../pathResolver'

describe('pathResolver', () => {
  describe('calculateGlobPattern', () => {
    it('should return ** for root files', () => {
      const result = calculateGlobPattern({
        sourcePath: '/project/AGENTS.md',
        basePath: '/project'
      })
      expect(result).toBe('**')
    })
  })
})
```

#### Property-Based Tests

Test universal properties using fast-check:

```typescript
import { describe, it } from 'vitest'
import fc from 'fast-check'
import { removeBom } from '../frontMatter'

describe('frontMatter properties', () => {
  it('should be idempotent', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (content) => {
          const withBom = '\uFEFF' + content
          const result1 = removeBom(withBom)
          const result2 = removeBom(result1)
          
          expect(result1).toBe(result2)
          expect(result1).not.toContain('\uFEFF')
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

#### Integration Tests

Test end-to-end command execution:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { kiroExportCommand } from '../kiroSteeringExport'
import fs from 'fs-extra'

describe('kiroExportCommand integration', () => {
  beforeEach(async () => {
    await fs.ensureDir('.kiro/steering')
  })

  afterEach(async () => {
    await fs.remove('.kiro/steering')
  })

  it('should export files to kiro directory', async () => {
    await kiroExportCommand()
    
    const files = await fs.readdir('.kiro/steering')
    expect(files.length).toBeGreaterThan(0)
  })
})
```

## Development Workflow

### 1. Setup Development Environment

```bash
# Install dependencies
pnpm install

# Verify setup
pnpm type-check
pnpm lint
pnpm test
```

### 2. Make Changes

```bash
# Create feature branch
git checkout -b feature/new-export-command

# Make changes to source files
# Edit src/commands/export/newExport.ts

# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Fix linting issues automatically
pnpm lint --fix
```

### 3. Write Tests

```bash
# Create test file
# Edit src/commands/__tests__/newExport.integration.test.ts

# Run tests in watch mode during development
pnpm test --watch

# Run specific test file
pnpm test src/commands/__tests__/newExport.integration.test.ts
```

### 4. Build and Verify

```bash
# Build the project
pnpm build

# Test the built CLI
node dist/cli.js newtool:export

# Or use the CLI directly
pnpm tn newtool:export
```

### 5. Commit Changes

```bash
# Stage changes
git add src/commands/export/newExport.ts
git add src/commands/__tests__/newExport.integration.test.ts

# Commit with conventional commit message
git commit -m "feat: add newtool export command"

# Push changes
git push origin feature/new-export-command
```

## Code Quality

### Type Checking

```bash
# Run TypeScript type checker
pnpm type-check
```

### Linting

```bash
# Run ESLint
pnpm lint

# Auto-fix linting issues
pnpm lint --fix
```

### Formatting

Follow the project's `.editorconfig` settings:

- Indent: 2 spaces
- Line endings: LF
- Charset: UTF-8
- Trim trailing whitespace
- Insert final newline

## Debugging

### Debug Tests

```bash
# Run tests with Node.js debugger
node --inspect-brk node_modules/.bin/vitest run

# Or use VS Code debugger with launch configuration
```

### Debug CLI Commands

```bash
# Run CLI with Node.js debugger
node --inspect-brk dist/cli.js kiro:export

# Add debug logging
LOG_LEVEL=debug pnpm tn kiro:export
```

### View Logs

Log files are stored in the `logs/` directory:

```bash
# View error logs
cat logs/error.log

# View info logs
cat logs/info.log

# View debug logs
cat logs/debug.log

# View warning logs
cat logs/warn.log
```

## Best Practices

### Command Layer

- Keep commands thin - delegate to services
- Handle errors and set exit codes
- Use logger instead of console.log
- Always shutdown logger in finally block

### Service Layer

- Implement business logic here
- Use utilities for low-level operations
- Return structured results
- Log business operations

### Utility Layer

- Keep functions pure and stateless
- No business logic
- Comprehensive error handling
- Well-tested with unit and property tests

### Testing

- Write tests for all new functionality
- Use property-based tests for mathematical properties
- Integration tests for commands
- Aim for high coverage but focus on critical paths

### Error Handling

- Use custom error classes
- Include context in errors
- Log errors with appropriate levels
- Never suppress errors silently

## Troubleshooting

### Tests Failing

```bash
# Clear test cache
pnpm test --clearCache

# Run tests with verbose output
pnpm test --reporter=verbose

# Run single test file to isolate issue
pnpm test src/utils/__tests__/fileWalker.test.ts
```

### Build Errors

```bash
# Clean build artifacts
rm -rf dist/

# Rebuild
pnpm build

# Check for type errors
pnpm type-check
```

### Import Errors

The project uses path aliases configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Use `@/` prefix for imports:

```typescript
import { getLogger } from '@/utils/logger'
import { ExportService } from '@/services/export/ExportService'
```

## Resources

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture documentation
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [fast-check Documentation](https://fast-check.dev/)
