import type { InitOptions } from '../types'

export function generateEditorConfig(): string {
  return `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2
max_line_length = 160

[*.md]
trim_trailing_whitespace = false
`
}

export function generateGitIgnore(): string {
  return `# Dependencies
node_modules/
pnpm-lock.yaml

# Build outputs
dist/
*.tsbuildinfo

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test
.env.local
.env.production

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless/

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# Stores VSCode versions used for testing VSCode extensions
.vscode-test
`
}

export function generateReadme(options: InitOptions): string {
  return `# ${options.projectName ?? 'aindex'}

${options.description ?? 'Personal digital knowledge base and prompt engineering workspace.'}

## Project Structure

This project follows the aindex architecture with dual-layer functionality:

1. **Personal Knowledge Graph Management**: Systematic management of learning outcomes and experience records
2. **Prompt Engineering Workspace**: High-quality prompt authoring for external projects

## Quick Start

\`\`\`bash
# Install dependencies
pnpm install

# Initialize the project (if not already done)
tn init

# Check for outdated dependencies
tn dep:check

# Update dependencies
tn dep:update
\`\`\`

## Commands

- \`tn init\` - Initialize aindex project
- \`tn dep:check\` - Check outdated dependencies  
- \`tn dep:update\` - Update dependencies
- \`tn\` - Select and manage projects

## Architecture

See the project documentation for detailed architecture information.
`
}

export function generateBasicTemplate(): string {
  return `---
created: {{date}}
tags: []
---

# {{title}}

## Overview

## Key Points

## References

## Related Topics
`
}

export function generateProjectTemplate(): string {
  return `---
created: {{date}}
status: active
tags: [project]
---

# {{title}}

## Project Overview

## Goals

## Progress

## Resources

## Notes
`
}

export function generateProjectFile(projectName: string): string {
  return `---
created: ${new Date().toISOString().split('T')[0]}
status: active
tags: [project]
---

# ${projectName}

## Project Overview

This project corresponds to the \`_airef/${projectName}/\` directory.

## Goals

## Progress

## Resources

## Notes
`
}
