# Prompt Deployment Script Usage Guide

_ai/.scripts/ provides a prompt deployment script system using a dual-layer architecture: shell launcher (`dep` / `dep.bat`) + Node.js core logic, deploying `_ai/dist/` and `_airef/*/dist/` to target projects.

## Environment Requirements

- **Node.js**: 24.x and above
- **Operating System**: Linux / macOS / Windows
- **Permissions**: Linux/macOS requires adding executable permission to `dep` script

## Basic Usage

### Linux / macOS

```bash
# Add executable permission on first use
chmod +x dep

# Deploy global prompts
./dep --source _ai/dist --target ~/project/my-app

# Deploy external project prompts
./dep --source _airef/compose-client/dist --target ~/project/compose-client
```

### Windows

```batch
# Deploy global prompts
dep.bat --source _ai/dist --target C:\project\my-app

# Deploy external project prompts
dep.bat --source _airef/compose-client/dist --target C:\project\compose-client
```

## Command Line Parameters

- `--source` (required): Source dist directory path, such as `_ai/dist` or `_airef/<project>/dist`
- `--target` (required): Target project root directory path, supports relative and absolute paths

## Common Errors

```bash
# ❌ Error: Execute from subdirectory
cd _ai/.scripts && ../../dep

# ❌ Error: Missing required parameters
./dep --source _ai/dist

# ❌ Error: Bypass launcher script
node _ai/.scripts/dist/index.js

# ✅ Correct: Execute complete command from root directory
./dep --source _ai/dist --target ~/project/my-app
```

**Notes**:
- MUST execute launcher script from project root directory
- MUST provide complete `--source` and `--target` parameters
- DO NOT bypass launcher script and directly invoke Node.js core logic

## Development Process

### Modify Code

```bash
# 1. Enter script directory
cd _ai/.scripts

# 2. Modify source code
vim src/index.ts

# 3. Type check + code check + test
pnpm type-check && pnpm lint && pnpm test

# 4. Compile
pnpm build

# 5. Return to root directory and test deployment
cd ../..
./dep --source _ai/dist --target ~/test-project

# 6. Commit (including dist/ compiled artifacts)
git add _ai/.scripts/src/ _ai/.scripts/dist/ dep dep.bat
git commit -m "feat: add new deployment feature"
```

### Development Commands

```bash
# Type check
pnpm type-check

# Code check and auto-fix
pnpm lint

# Run tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Compile
pnpm build
```

## Deployment Features

The script automatically executes the following operations:

1. ✅ Validate source dist directory exists
2. ✅ Copy dist artifacts to target project
3. ✅ Rename hidden directories (`_claude/` → `.claude/`)
4. ✅ Update `.gitignore`
5. ✅ Sync `.vscode/settings.json` color configuration
6. ✅ Copy `.editorconfig` to target project
7. ✅ Export AGENTS.md to `.qoder/rules/` and `.codebuddy/.rules/`
8. ✅ Clean up old `.cursor/rules/` directory (Cursor 0.40+ natively supports AGENTS.md)

## Technology Stack

- **Language**: TypeScript 5.9+
- **Runtime**: Node.js 24+
- **Module Specification**: ES Module
- **Package Manager**: pnpm
- **Build Tool**: tsdown (based on esbuild)
- **Testing Framework**: vitest
- **Code Linting**: ESLint 9

## Directory Structure

```
_ai/.scripts/
├── src/                  # TypeScript source code
│   └── index.ts         # Deployment core logic
├── dist/                # Compiled artifacts
│   ├── index.js         # ES Module format
│   └── index.d.ts       # TypeScript type declarations
├── package.json         # pnpm project configuration
├── tsdown.config.ts     # tsdown compilation configuration
├── tsconfig.json        # TypeScript configuration
├── eslint.config.ts     # ESLint configuration
├── vitest.config.ts     # Vitest test configuration
└── README.md            # This document (compiled artifact)

Project root directory:
├── dep                  # Linux/macOS launcher script
└── dep.bat              # Windows launcher script
```

## Version Control

- ✅ **Commit Compiled Artifacts**: `dist/` directory needs to be committed to version control to ensure direct use after cloning
- ✅ **Synchronous Commit**: MUST compile and commit `dist/` simultaneously after modifying `src/`
- ❌ **Ignore Dependencies**: `node_modules/` is already ignored in `.gitignore`

## Debugging

```bash
# Start debugger (debug compiled artifacts)
node --inspect _ai/.scripts/dist/index.js --source _ai/dist --target ~/test

# During development, use tsx to directly run TypeScript (requires additional installation)
pnpm add -D tsx
pnpm tsx src/index.ts --source _ai/dist --target ~/test
```

## Troubleshooting

### Node.js Version Does Not Meet Requirements

```
Error: Node.js 24+ is required, current version: v22.x.x
```

**Solution**: Upgrade Node.js to 24.x or higher

### Cannot Find dist Directory

```
Error: Source directory does not exist: _ai/dist
```

**Solution**: 
1. Ensure prompts have been compiled: enter `_ai` directory and execute the corresponding compilation command
2. Confirm source path spelling is correct

### Permission Error (Linux/macOS)

```
-bash: ./dep: Permission denied
```

**Solution**: Add executable permission `chmod +x dep`

### Path Error

```
Error: Cannot find module '_ai/.scripts/dist/index.js'
```

**Solution**: MUST execute `./dep` or `dep.bat` from project root directory

