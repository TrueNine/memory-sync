export default {
  name: 'power-builder',
  displayName: 'Power Builder',
  description: 'Complete guide for building and testing new Kiro Powers with templates, best practices, and validation',
  keywords: ['kiro power', 'power builder', 'build power', 'create power', 'mcp power', 'power documentation'],
  author: 'Kiro Team',
}

# Power Builder

## Overview

Learn how to build your own Kiro Powers with comprehensive guides covering everything from initial setup to testing and sharing. This power provides step-by-step instructions, templates, best practices, and validation tools for creating Guided MCP Powers and Knowledge Base Powers.

Whether you're documenting an MCP server, creating a CLI tool guide, or sharing best practices, this power walks you through the complete process including:
- Understanding the two types of powers (Guided MCP Powers and Knowledge Base Powers)
- Creating proper directory structures and required files
- Writing effective POWER.md documentation with frontmatter
- Configuring mcp.json for MCP servers
- Deciding when to split powers into multiple workflows
- Interactive power creation with agent guidance
- Testing locally with configure
- Sharing via repositories

## Getting Started

**For AI agents helping users build powers:**

This documentation provides all the concepts, schemas, and best practices you need. Once you've reviewed this, **read the interactive steering file for step-by-step guidance**:

```
Call action "readSteering" with powerName="power-builder", steeringFile="interactive.md"
```

The interactive workflow will guide you through:
- Understanding the user's use case
- Determining the right power type
- Gathering documentation
- Generating all necessary files
- Testing and installation

## Available Steering Files

This power has two steering files:

- **interactive** - Interactive agent-guided power creation workflow (read this after reviewing the documentation below)
- **testing** - Complete guide to testing and updating powers

**All conceptual knowledge is in this POWER.md file.** The steering files provide workflows for creation and testing.

## What is a Kiro Power?

A **Kiro Power** is documentation that packages:
1. **Knowledge** - POWER.md file with instructions, workflows, and best practices
2. **Optional MCP Integration** - mcp.json configuration if the power needs MCP servers
3. **Optional Steering** - Additional workflow guides for complex use cases

**Two Types:**
- **Guided MCP Powers** - Include MCP server configuration (mcp.json) plus documentation
- **Knowledge Base Powers** - Pure documentation (no mcp.json), such as CLI tool guides or best practices

---

## Philosophy: Two Types of Powers

### 1. Guided MCP Power 🎯

**Definition**: Powers that connect to MCP servers with comprehensive documentation.

**Structure:**
- `POWER.md` - Onboarding, workflows, troubleshooting
- `mcp.json` - MCP server configuration (required)
- Optional: `steering/` for multiple workflow guides

**When to Create:**
- You want to document an MCP server
- You need to provide setup and usage instructions
- You want to guide users through MCP tool usage

**Examples:**
- **Generate Release Notes** - Uses git MCP to parse commits and format changelogs
- **Supabase Local Dev** - Local development workflow for Supabase
- **Supabase Remote Dev** - Remote/cloud workflow for Supabase

**Steering Content**: Acts as a **knowledge base + configuration**
- Onboarding: Setup, installation, prerequisites
- Common workflows: Step-by-step instructions
- Troubleshooting: Common MCP errors and solutions

**Example Frontmatter:**
```yaml
---
name: "generate-release-notes"
displayName: "Generate Release Notes"
description: "Generate formatted release notes from git commits"
keywords: ["release", "changelog", "version", "notes", "git"]
author: "Your Name"
---
```

### 2. Knowledge Base Power 📚

**Definition**: Powers that provide pure documentation without MCP server connection.

**Structure:**
- `POWER.md` - Knowledge base content
- Optional: `steering/` for organized documentation
- **No mcp.json** file (this is the key difference)

**Important:** Knowledge Base Powers should usually include an **Onboarding section** in POWER.md to help users get started with the documented tool or knowledge.

**Common Subtypes:**
- **CLI Tool Guides** - Installation, usage, troubleshooting for command-line tools
- **Best Practices** - Coding patterns, architecture guidelines, security checklists
- **Workflow Documentation** - Step-by-step processes and procedures
- **Troubleshooting Guides** - Problem-solving knowledge bases
- **Reference Documentation** - Quick references, API guides, cheatsheets

**When to Create:**
- Documenting a CLI tool (not an MCP server)
- Sharing best practices or patterns
- Creating workflow guides
- Building troubleshooting knowledge bases

**Examples:**
- **Terraform CLI Guide** - Installation and usage of Terraform CLI
- **Best Practices Guide** - Coding patterns, architecture guidelines
- **Security Checklist** - Security review steps
- **Testing Strategies** - Test organization patterns

**Steering Content for CLI Tools**: Acts as **comprehensive guide**
- Onboarding: CLI installation instructions, prerequisites
- Common workflows: How to use CLI for various tasks
- Troubleshooting: Common CLI errors and solutions

**Steering Content for Other Types**: Acts as **knowledge repository**
- Best practices and guidelines
- Decision trees and checklists
- Pattern libraries
- Reference documentation

**Example Frontmatter:**
```yaml
---
name: "terraform-cli-guide"
displayName: "Terraform CLI Guide"
description: "Complete guide for using Terraform CLI with best practices"
keywords: ["terraform", "cli", "infrastructure", "iac"]
author: "Your Name"
---
```

---

### Decision Matrix: Which Type Should I Build?

| Question | Guided MCP Power | Knowledge Base Power |
|----------|------------------|----------------------|
| Does it connect to an MCP server? | ✅ Yes | ❌ No |
| Has mcp.json file? | ✅ Yes | ❌ No |
| Documents a CLI tool? | ❌ No | ✅ Often |
| Pure documentation/knowledge? | ❌ No (has tools) | ✅ Yes |
| Requires MCP tool execution? | ✅ Yes | ❌ No |
| Example: Git MCP server guide | ✅ Guided MCP Power | ❌ Not this type |
| Example: Terraform CLI guide | ❌ Not this type | ✅ Knowledge Base Power |
| Example: Best practices doc | ❌ Not this type | ✅ Knowledge Base Power |

---

## File Locations Reference

Understanding where Kiro stores configuration and steering files:

### MCP Configuration Locations

**Workspace Level:**
```
.kiro/settings/mcp.json
```
- Located in workspace root
- Workspace-specific MCP servers
- Checked first when looking for existing MCP configs

**User Level:**
```
~/.kiro/settings/mcp.json
```
- Global MCP servers available across all workspaces
- Fallback if workspace config doesn't exist

**Powers Configuration (Generated):**
```
~/.kiro/powers.mcp.json
```
- Auto-generated from installed powers
- Combines MCP configs from all installed powers

### Steering File Locations

**Workspace Level:**
```
.kiro/steering/
```
- Workspace-specific steering files
- Can be used as source for Knowledge Base Powers

**User Level:**
```
~/.kiro/steering/
```
- Global steering files
- Available across all workspaces
- Can be used as source for Knowledge Base Powers

---

## Power Granularity Best Practices

### Default: Single Power is Best

**⭐ IMPORTANT: A single power is perfectly fine for most cases.**

Do NOT default to suggesting splitting powers. Most tools should be documented as a single comprehensive power.

**Only split if there's a very strong conviction that it will significantly improve usability.**

### When to Split Powers (Rare)

Split only when there's a **strong conviction** that workflows are:
- **Completely independent** and never used together
- In **different environments** (local vs remote, dev vs prod)
- Require **different setups** or configurations
- Would be **confusing** if combined

**Examples of valid splitting (rare):**
```
Example: Supabase
✅ supabase-local-dev (local environment, different setup)
✅ supabase-remote-dev (cloud environment, different auth)
Reasoning: Entirely different contexts, users only use one at a time
```

### Default: Keep Together (Most Cases)

**The vast majority of tools should be a single power:**

❌ **Don't split these** - keep as one power:
```
✅ terraform (all commands together)
✅ git (all operations together)
✅ docker (full container lifecycle)
✅ aws-cli (all AWS services)
✅ kubectl (all Kubernetes operations)
✅ postgresql (all database operations)
```

**Even if there are many commands or workflows, keep them together unless there's a strong reason to split.**

### Naming Convention

**Default naming (use this):**
```
{tool-name}
```
Examples: `terraform`, `git`, `docker`, `kubectl`

**Only if splitting (rare):**
```
{tool-name}-{workflow-name}
```
Examples: `supabase-local-dev`, `supabase-remote-dev`

### Decision Framework

**Start with:** Should this be a single power? (Default answer: YES)

**Only split if ALL of these are true:**
1. ✅ Workflows are completely independent
2. ✅ Users will never need both together
3. ✅ Different environments or contexts
4. ✅ You have strong conviction it improves usability

**If even one is false → Keep as a single power**

---

## Knowledge Base Power Patterns

### Pattern 1: CLI Tool Guide

Structure for documenting command-line tools:

**POWER.md Contents:**
1. **Onboarding Section**
   - CLI installation instructions
   - Prerequisites (Node.js, Python, system requirements)
   - Basic setup and configuration

2. **Common Workflows Section**
   - Step-by-step CLI usage for common tasks
   - Command examples with explanations
   - Flag and option documentation

3. **Troubleshooting Section**
   - Common CLI errors
   - Installation issues
   - Platform-specific problems

**Example Structure:**
````markdown
## Onboarding

### Installation

#### Via npm
```bash
npm install -g tool-name
```

#### Via pip
```bash
pip install tool-name
```

### Prerequisites
- Node.js 16+ or Python 3.8+
- Operating system: macOS, Linux, Windows

### Basic Configuration
```bash
tool-name config set api-key YOUR_API_KEY
```

## Common Workflows

### Workflow 1: Initialize Project
```bash
# Create new project
tool-name init my-project

# Navigate to project
cd my-project

# Verify setup
tool-name status
```

### Workflow 2: Deploy Application
```bash
# Build project
tool-name build

# Test locally
tool-name serve --local

# Deploy to production
tool-name deploy --production
```

## Troubleshooting

### Error: "Command not found"
**Cause:** CLI not in PATH
**Solution:**
1. Verify installation: `which tool-name`
2. Add to PATH if needed
3. Restart terminal

### Error: "Permission denied"
**Cause:** Insufficient permissions
**Solution:**
1. Use `sudo` (Linux/macOS)
2. Run as administrator (Windows)
3. Check file permissions
````

### Pattern 2: Best Practices Guide

Structure for documenting patterns and guidelines:

**POWER.md Contents:**
1. **Overview**: What the best practices cover
2. **Principles**: Core principles to follow
3. **Patterns**: Specific patterns with examples
4. **Examples**: Real-world examples

**Example Structure:**
````markdown
## Overview
Comprehensive security best practices for web applications

## Core Principles
1. **Defense in Depth** - Multiple layers of security
2. **Least Privilege** - Minimal necessary permissions
3. **Fail Securely** - Safe failure modes

## Patterns

### Pattern: Input Validation
**Problem:** Untrusted user input
**Solution:** Validate and sanitize all inputs
```
// Good
const sanitized = sanitizeInput(userInput);
if (isValid(sanitized)) {
  process(sanitized);
}

// Bad
process(userInput); // Direct use without validation
```
````

### Pattern 3: Troubleshooting Guide

Structure for problem-solving documentation:

**POWER.md Contents:**
1. **Common Problems**: List of frequent issues
2. **Diagnostic Steps**: How to identify problems
3. **Solutions**: Step-by-step fixes
4. **Prevention**: How to avoid problems

**Example Structure:**
````markdown
## Common Problems

### Problem: Application Won't Start

**Symptoms:**
- Error: "Port already in use"
- Application crashes immediately
- No logs appearing

**Diagnostic Steps:**
1. Check if port is available: `lsof -i :3000`
2. Review error logs: `tail -f logs/error.log`
3. Verify dependencies: `npm list`

**Solution:**
1. Kill process using port:
   ```bash
   kill $(lsof -t -i:3000)
   ```
2. Or use different port:
   ```bash
   PORT=3001 npm start
   ```

**Prevention:**
- Use environment variables for ports
- Implement graceful shutdown
- Document port requirements
````

### Pattern 4: Reference Documentation

Structure for quick reference guides:

**POWER.md Contents:**
1. **Quick Reference**: Cheat sheet format
2. **API Reference**: Function/endpoint documentation
3. **Examples**: Common usage examples
4. **See Also**: Related documentation

**Example Structure:**
````markdown
## Quick Reference

### Common Commands
| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize project | `tool init my-app` |
| `build` | Build project | `tool build --prod` |
| `deploy` | Deploy to production | `tool deploy` |

### Configuration Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 3000 | Server port |
| `env` | string | "development" | Environment |

## API Reference

### Method: `create(options)`
Creates a new resource

**Parameters:**
- `options.name` (string, required): Resource name
- `options.type` (string, optional): Resource type

**Returns:** Promise<Resource>

**Example:**
```
const resource = await create({
  name: "my-resource",
  type: "standard"
});
```
````

---

## Power Structure

Powers can have three different structures depending on complexity:

### Pattern A: Simple Power (Most Common)
```
weather/
├── mcp.json    # MCP server config
└── POWER.md    # Everything: metadata + docs + steering
```
**Use for:** Most powers. Everything agents need is in POWER.md.

### Pattern B: Multiple Workflow Power
```
playwright/
├── mcp.json         # MCP server config
├── POWER.md         # Overview + common patterns
└── steering/        # Dynamic content loaded on-demand
    ├── web-scraping.md
    ├── e2e-testing.md
    └── performance.md
```
**Use when:** POWER.md >500 lines OR independent workflows OR progressive discovery needed.

**Note:** Steering files can contain workflows, troubleshooting guides, advanced features, references - any dynamic content loaded on-demand.

### Pattern C: Knowledge Base Power (No MCP)
```
testing-strategies/
├── POWER.md         # Overview of all topics
└── steering/        # Knowledge repository
    ├── unit-testing.md
    ├── integration-testing.md
    └── e2e-testing.md
```
**Use for:** Pure documentation/guidance. Maximum context preservation - agents only load what's relevant.

### Required Components

**ALL powers MUST have:**
1. **POWER.md** (required) - With complete frontmatter metadata
   - name, displayName, description (required)
   - keywords, author (optional but recommended)
   - Overview and documentation

**Guided MCP Powers ALSO need:**
2. **mcp.json** (required) - MCP server configuration

**Powers with multiple workflows MAY have:**
3. **steering/** directory (optional) - Additional dynamic content

### File Purpose

| Component | Purpose | Read By | When |
|-----------|---------|---------|------|
| `POWER.md` | **REQUIRED:** Metadata + primary documentation | Agent | **First** (via activate action) |
| `mcp.json` | Technical MCP server config (if power has tools) | System | Installation |
| `steering/*.md` | Dynamic content (workflows, troubleshooting, advanced features, references) | Agent | **On-demand** (via readSteering action) |

**Context Strategy:** Agents get steeringFiles list from activate, then load specific files only when needed.

---

## mcp.json Format

**Required for:** Guided MCP Powers
**Not needed for:** Knowledge Base Powers

**Schema:**
```json
{
  "mcpServers": {
    "server-name": {
      // Local (STDIO) MCP Server:
      "command": "string",
      "args": ["array"],
      "env": {"KEY": "value"},
      "cwd": "string",

      // OR Remote (HTTP/SSE) MCP Server:
      "url": "string",
      "headers": {"Authorization": "Bearer token"},

      // Common options:
      "disabled": false,
      "autoApprove": ["tool_name"],
      "disabledTools": []
    }
  }
}
```

**Note:** Use either local (command/args) OR remote (url/headers), not both.

**Single MCP Server Example:**
```json
{
  "mcpServers": {
    "weather": {
      "command": "npx",
      "args": ["-y", "@dangahagan/weather-mcp"],
      "env": {"ENABLED_TOOLS": "all"}
    }
  }
}
```

**Multiple MCP Servers Example:**
```json
{
  "mcpServers": {
    "github-api": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {"GITHUB_TOKEN": "GITHUB_TOKEN_ENV_VAR"}
    },
    "git-local": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    }
  }
}
```

---

## POWER.md Frontmatter Format

**Only these 5 fields exist:**
```yaml
---
name: "power-name"
displayName: "Human Readable Name"
description: "Clear description (max 3 sentences)"
keywords: ["keyword1", "keyword2", "keyword3"]
author: "Your Name"
---
```

**Required Fields:**
- `name`: Lowercase kebab-case identifier
- `displayName`: Human-readable title
- `description`: Clear description (max 3 sentences)

**Optional Fields:**
- `keywords`: Search keywords (improves discoverability)
- `author`: Creator name or organization

**IMPORTANT:** Fields like `version`, `tags`, `repository`, `license` do NOT exist and should NOT be used.

**Recommended POWER.md Sections:**
- **Overview**: What the power does and why it's useful
- **Available Steering Files**: List of steering files (if any)
- **Available MCP Servers**: Server and tool listings (if Guided MCP Power)
- **Tool Usage Examples**: How to use tools (if Guided MCP Power)
- **Best Practices**: Key practices for using this power
- **Troubleshooting**: Common errors and solutions
- **Configuration**: Setup requirements (if any)

### Optional `steering/*.md` Files

**Only create when:**
- POWER.md exceeds ~500 lines (context preservation)
- Power has independent workflows that don't need to be loaded together
- Dynamic content loading improves usability

**Use cases:**
- Independent workflows (web-scraping.md, e2e-testing.md)
- Advanced patterns (advanced-automation.md)
- Specialized domains (mobile-testing.md)
- Troubleshooting guides (troubleshooting.md)
- Reference docs (reference.md)

**When NOT to create:**
- Power is simple (< 500 lines in POWER.md)
- All content is closely related
- Agents need all information upfront

## Testing and Validation

For complete testing and validation instructions, read the testing steering file:

```
Call action "readSteering" with powerName="power-builder", steeringFile="testing.md"
```

The testing guide covers:
- Local testing workflow
- Installation via local directory
- Testing checklist
- Troubleshooting common issues
- Updating powers

---

## Best Practices

### Naming Conventions

**Power Names:**
- Use `kebab-case-format`
- Be descriptive: `generate-release-notes`, `track-competitor-prices`
- Action-oriented for workflow powers, tool-oriented for general powers
- Avoid: too generic (`helper`, `utils`), too long (>5 words)

**Display Names:**
- Use Title Case: "Generate Release Notes"
- Keep clear and professional (2-5 words)
- No emojis in display names

**Keywords:**
- Include 5-7 relevant keywords
- Mix specific and general terms
- Think about user search patterns
- Include variations: "release", "changelog", "version"

### Description Writing

- Maximum 3 sentences
- Focus on value, not implementation
- Include key capabilities
- Use active voice

**Good Examples:**
- "Generate formatted release notes and changelogs from git commits with categorized changes"
- "Monitor competitor prices by scraping websites - compose with SQLite for historical tracking"
- "Complete browser automation - navigate, test, screenshot, scrape any web task"

### Documentation Quality

- Document exact MCP tool names (agents need these to call tools)
- Show complete, runnable examples
- Include troubleshooting for common errors
- Explain parameters clearly (types, required/optional)
- Cover all required sections thoroughly

### File Organization

- Put metadata in POWER.md frontmatter (never in mcp.json)
- Only create steering/ directory when needed (>500 lines or dynamic loading)
- Use workspace paths for development: `{workspace}/powers/`
- Default to single power (only split with strong conviction)

### MCP Configuration

- Never include display metadata in mcp.json (goes in POWER.md frontmatter)
- Document environment variables clearly
- Provide MCP configuration reference: https://kiro.dev/docs/mcp/configuration/
- Only disable tools with explicit user consent

---

---
[[interactive.md]]

# Interactive Power Creation Guide

This steering file guides you through creating a Kiro Power interactively using tools and step-by-step questions.

---

## Overview

This interactive workflow will guide you to:
1. Work with the user to understand their use case and determine power type
2. Guide the user through gathering documentation
3. Help the user decide on power granularity (when to split)
4. Generate all necessary files automatically
5. Guide the user through testing and installation
6. Help the user share their power

---

## Table of Contents
- [Step 1: Understand User's Use Case and Determine Power Type](#step-1-understand-users-use-case-and-determine-power-type)
- [Step 2: Guided MCP Power Workflow](#step-2-guided-mcp-power-workflow)
- [Step 3: Knowledge Base Power Workflow](#step-3-knowledge-base-power-workflow)
- [Assess Power Granularity](#assess-power-granularity)
- [Step 4: Testing & Installation](#step-4-testing--installation)
- [Sharing Your Power](#sharing-your-power)

---

## Step 1: Understand User's Use Case and Determine Power Type

### Understand the Use Case

**Have a natural conversation with the user to understand their use case and determine which type of power they're building.**

Don't just ask "What type of power?" - instead, through conversation, gather information about:
- What they're trying to document or build
- What problem this solves for them
- Whether this involves an MCP server or is pure documentation
- What workflows they want to enable
- Whether this is for a CLI tool, an MCP server, best practices, or something else

**Through this conversation, determine:**
- What problem the power solves
- Whether they need MCP server integration (→ Guided MCP Power)
- Whether it's pure documentation (→ Knowledge Base Power)
- What specific subtype (CLI tool guide, best practices, troubleshooting guide, etc.)
- **The power name** (will be used to create directory)

**Once you understand the use case and have determined the power name:**
- If involves MCP server → Proceed to setup directory, then go to Step 2 (Guided MCP Power)
- If pure documentation → Proceed to setup directory, then go to Step 3 (Knowledge Base Power)

**Remember:** Help the user figure out the right type based on their needs, don't just present options.

---

### Setup: Create Power Directory

**Now that you know the power name, create the power directory in the workspace:**

```bash
mkdir {workspace}/powers
mkdir {workspace}/powers/{power-name}
cd {workspace}/powers/{power-name}
```

**Tell the user:**
```
"I've created a directory at {workspace}/powers/{power-name} where we'll build your power. Let's start gathering the information we need!"
```

---

## Step 2: Guided MCP Power Workflow

### 2.1: Check for Existing MCP Configuration

**Ask the user if they already have the MCP server configured:**

Through conversation, find out if the MCP server they want to document is already installed and configured in Kiro.

**If the MCP server is already configured:**

Ask where it's configured:
- Workspace level: `.kiro/settings/mcp.json`
- User level: `~/.kiro/settings/mcp.json`

Then:
1. Read the appropriate config file
2. Extract the server configuration (command, args, env variables)
3. Save this for later use in generating the power

**Why this helps:** You can see the actual working configuration, understand how the server is set up, and potentially test the tools directly.

**If the MCP server is NOT configured:**

Encourage the user to install it first:

"I recommend installing the MCP server in Kiro before we create the power documentation. This will help me:
- Understand exactly how the server works
- Test the tools and see their actual parameters
- Create more accurate documentation with verified examples
- Document common errors I can observe firsthand

Would you like to install the MCP server now?"

**If user agrees to install:**
- Guide them through MCP server installation in Kiro
- Once installed, proceed with testing and documentation

**If user declines to install:**
- Accept their decision: "That's okay, we can proceed without it."
- Note: "The documentation may be less detailed since I can't test the tools directly, but we'll do our best with the information available."
- Proceed with gathering information from other sources (documentation, user knowledge)

### 2.2: Gather Basic Information

**Through natural conversation, gather the following information:**

Work with the user to collect:
- **Tool/server name** - What is the name of the MCP server or tool? (e.g., "git", "supabase", "postgresql")
- **Workflow name (if applicable)** - If this is a specific workflow, what is it called? (e.g., "local-dev", "remote-dev" - leave empty if covers all workflows)
- **Description** - A clear, concise description of what this power does (help them refine to max 3 sentences)
  - Example: "Manage local Supabase development environment with database migrations and testing"
- **Keywords** - 3-5 keywords for searchability and discovery (e.g., "supabase", "local", "development", "database", "migration")

  ⚠️ **IMPORTANT - Keyword Specificity:**
  - Avoid overly broad keywords (e.g., "test", "debug", "data", "api", "help")
  - Broad keywords cause false positive activations
  - False positives annoy users and lead to power uninstallation
  - Use specific, unique keywords related to the power's specific domain
  - Example: Instead of "database", use "postgresql", "mongodb", or "supabase"

- **Author** - Who is creating this power? (Their name or organization)

**Generate power name from the information gathered:**
- If specific workflow: `{tool-name}-{workflow-name}`
- If all workflows: `{tool-name}`
- Ensure kebab-case format (lowercase with hyphens)

### 2.3: Gather Documentation

**Through conversation, discover what documentation sources are available:**

Ask the user how they'd like to provide documentation for this MCP server. They might have:
- Documentation URLs (official docs, GitHub READMEs, tutorials)
- Local documentation files (README.md, docs folder, markdown files)
- Knowledge in their head (they can describe how the MCP server works)

**Work with what they provide:**

**If they have documentation URLs:**
- Collect the URLs from them
- Note: You may need to ask them to paste relevant content since web_fetch may be limited
- Store the information for generating the power

**If they have local documentation files:**
- Ask for the file paths
- Read each file using the Read tool
- Store the content for generating the power

**If they can describe it through conversation:**
- Have a natural conversation to gather information about:
  - What the MCP server does
  - How to install and set it up
  - Common workflows and use cases
  - Available tools and their parameters
  - Common errors and troubleshooting tips

### 2.4: Extract MCP Server Information

**If the MCP server is already configured (from Section 2.1):**
- You already have the mcp.json configuration
- Extract: server name, command, args, env variables
- Use this information when generating the power

**If documenting a new MCP server (not yet configured):**

Ask the user to provide the MCP server configuration. Through conversation:

1. **Request the MCP config:** "Can you provide the MCP server configuration for this server? This could be from documentation, a README, or an existing config file."

2. **Check Kiro's MCP schema conformance:**
   - Verify it matches Kiro's MCP server schema format (documented in mcp.json Format section of POWER.md)
   - If the config doesn't match Kiro's schema, work with the user to convert it

3. **Convert if needed:**
   - Extract command and args from start scripts or documentation
   - Identify required environment variables
   - Convert from other MCP config formats to Kiro's format
   - Ask clarifying questions about any unclear configuration options

4. **Validate:**
   - Ensure all required fields are present
   - Verify environment variables are documented
   - Confirm the configuration will work in Kiro's MCP system

**Gather information about available tools:**

Through conversation or by reading documentation, collect information about each tool the MCP server provides:
- Tool name
- What the tool does
- Required parameters
- Optional parameters
- Example usage scenarios

We don't need to add MCP tool information to the POWER.md file since this information is provided at runtime. This is for your information only.

### 2.5: Tool Disabling (With User Consent)

**After gathering all tool information:**

Through conversation, discuss with the user whether any tools should be disabled for this specific power.

**Provide context to help them decide:**
- List all the tools the MCP server provides
- Explain that disabling unused tools reduces context and improves performance
- Clarify that only tools relevant to this specific power need to be enabled

**If the user identifies tools that aren't needed:**

1. List all available tools from the MCP server
2. Work with them to identify which tools should be disabled
3. For each tool, briefly explain what it does so they can make an informed decision
4. Get explicit confirmation before proceeding:
   - Show them the list of tools that will be disabled
   - Explain they won't be available when using this power
   - Remind them they can always re-enable tools later by editing mcp.json
5. Only after confirmation, add the tools to mcp.json `disabledTools` array

**Critical reminder:**
- **NEVER disable tools without explicit user consent**
- Always show which tools will be disabled
- Explain the impact clearly
- Get confirmation before proceeding

**Example mcp.json with disabled tools:**
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "disabledTools": ["tool1", "tool2", "tool3"]
    }
  }
}
```

### 2.6: Generate Power Files

**Create power directory:**

```bash
mkdir -p {workspace}/powers/{power-name}
cd {workspace}/powers/{power-name}
```

Tell user: "Creating power directory at: `{workspace}/powers/{power-name}`"

**Generate POWER.md:**

Create POWER.md with this structure:

````markdown
---
name: "{power-name}"
displayName: "{Display Name}"
description: "{clear, concise description - max 3 sentences}"
keywords: [{keyword1}, {keyword2}, ...]
author: "{author name}"
---

# {Display Name}

## Overview

{2-3 paragraphs synthesized from documentation explaining:
- What this MCP server does
- Why it's useful
- Key capabilities
- This specific workflow (if split power)}

## Onboarding

### Prerequisites
{List from documentation:
- System requirements
- Dependencies
- Accounts or credentials needed}

### Installation
{Installation steps from documentation}

### Configuration
{Configuration steps, environment variables, setup}

## Common Workflows

{For each major workflow, create a section:}

### Workflow 1: {Workflow Name}
{Description of what this workflow accomplishes}

**Steps:**
1. {Step with example command/tool usage}
2. {Step with example command/tool usage}
3. ...

**Example:**
```
{Complete working example}
```

**Common Errors:**
- Error: "{common error message}"
  - Cause: {why it happens}
  - Solution: {how to fix}

## Troubleshooting

### MCP Server Connection Issues

**Problem:** MCP server won't start or connect
**Symptoms:**
- Error: "Connection refused"
- Server not responding

**Solutions:**
1. Verify installation: `npx -y {package-name}`
2. Check environment variables are set correctly
3. Review logs for specific errors
4. Restart Kiro and try again

### Tool Execution Errors

{For each common error from documentation:}

**Error:** "{error message}"
**Cause:** {explanation}
**Solution:**
1. {Step to fix}
2. {Step to verify}
3. {Alternative if first doesn't work}

## Best Practices

{List best practices from documentation}
- {Practice 1}
- {Practice 2}
- {Practice 3}
- {Practice 4}
- {Practice 5}

## Configuration

{If no special config needed:}
**No additional configuration required** - works after MCP server is installed in Kiro.

{If config needed:}
**Environment Variables:**
- `{VAR_NAME}`: {description} (required/optional)

**Setup:**
1. {Configuration step}
2. {Configuration step}

## MCP Config Placeholders

{If mcp.json has placeholders for sharing:}

**IMPORTANT:** Before using this power, replace the following placeholders in `mcp.json` with your actual values:

{For EACH placeholder in the mcp.json, create an entry with THREE parts:}
{1. The placeholder name in backticks and bold}
{2. What the placeholder represents}
{3. HOW to obtain the actual value - be specific with steps or links}

**Example format:**
- **`YOUR_API_KEY_HERE`**: Your API key for {service name}.
  - **How to get it:**
    1. Go to {specific URL or dashboard}
    2. Navigate to {section/settings}
    3. Click "{button name}" to generate/copy API key
    4. Paste the key value here

- **`YOUR_DATA_PATH`**: Path to your local data directory where {what data} will be stored.
  - **How to set it:** Choose any directory on your system (e.g., `/Users/yourname/myapp-data` or `C:\Users\yourname\myapp-data`)
  - Create the directory: `mkdir -p /path/to/your/data`

- **`PLACEHOLDER_SERVER_PATH`**: Path to the {server name} installation directory.
  - **How to get it:**
    1. Install the server: `{installation command}`
    2. Note the installation path from the output
    3. Or use `which {command}` to find the path

{List ALL placeholders that appear in mcp.json - don't skip any}
{Common placeholder types: API keys, tokens, paths, URLs, ports, database names, credentials}

**After replacing placeholders, your mcp.json should look like:**
```json
{
  "mcpServers": {
    "{server-name}": {
      "command": "node",
      "args": ["/actual/path/to/your/server/index.js"],
      "env": {
        "API_KEY": "your-actual-api-key-here",
        "DATA_PATH": "/Users/yourname/myapp-data"
      }
    }
  }
}
```

{If no placeholders (power uses standard npm package):}
**No placeholders needed** - the mcp.json configuration works as-is with the standard npm package.

---

**Package:** `{npm-package-name}`
**MCP Server:** {server-name}
````

**Should you create steering files?**

Only create steering/ directory if:

- POWER.md exceeds ~500 lines (context preservation)
- Power has distinct independent workflows (e.g., web-scraping vs e2e-testing vs performance)
- Users don't need to know about all workflows upfront (progressive discovery)

**If creating steering files:**
- Keep overview and common patterns in POWER.md
- Split independent workflows into steering/ files (e.g., `steering/advanced-automation.md`)
- POWER.md should list available steering files with descriptions

**Default approach:** Single POWER.md file. Only split when content size or workflow independence requires it.

**Generate mcp.json:**

Create mcp.json:

```json
{
  "mcpServers": {
    "{server-name}": {
      "command": "{command}",
      "args": [{args}],
      "env": {
        "{ENV_VAR}": "{ENV_VAR}"
      }
    }
  }
}
```

**Tell the user:**
```
✅ Power files created successfully!

Files created:
- POWER.md: Main documentation with onboarding, workflows, and troubleshooting
- mcp.json: MCP server configuration
{if steering files created:}
- steering/: Workflow-specific guides

Location: {workspace}/powers/{power-name}/

Next: Testing and installation
```

**Proceed to Step 4**

---

## Step 3: Knowledge Base Power Workflow

### 3.1: Identify Knowledge Base Type

**Through conversation, determine what type of knowledge they're documenting:**

Based on your earlier conversation in Step 1, you should already have a sense of what they're building. Now clarify the specific type:

**Common types to guide the conversation:**
- **CLI Tool Guide** - Documenting a command-line tool with installation, usage, and troubleshooting
- **Best Practices** - Coding patterns, guidelines, and examples
- **Workflow Documentation** - Step-by-step processes and procedures
- **Troubleshooting Guide** - Common problems and solutions
- **Reference Documentation** - Quick reference, API guide, or cheatsheet
- **Other** - General knowledge base or documentation

**Once you understand the type, proceed with the appropriate sub-workflow below.**

---

### 3.2: CLI Tool Guide Workflow

**Through conversation, gather CLI tool information:**

Work with the user to collect:
- **CLI tool name** - What is the name of the CLI tool? (e.g., "terraform", "kubectl", "aws-cli")
- **Description** - A clear, concise description (help them refine to max 3 sentences)
  - Example: "Infrastructure as Code tool for building, changing, and versioning infrastructure safely and efficiently"
- **Installation methods** - How is the CLI tool installed?
  - Common options: npm install -g, pip install, brew install, apt-get install, download binary, or other
- **Package or binary name** - What is the package or binary name? (e.g., "@aws-sdk/client-s3", "terraform")

**Check for workflow splitting:**

Same approach as in Section 2.2 - through conversation, determine if the CLI has multiple independent high-level workflows.

**Examples to guide the conversation:**
- ✅ Rare split: "aws-deployment" vs "aws-monitoring" (completely independent)
- ❌ Don't split: All terraform commands together (default)

**Gather documentation:**

Use the same approach as Section 2.4:
- Ask about documentation sources (URLs, local files, or their knowledge)
- Collect whatever they can provide

**Gather information about CLI workflows:**

Through conversation, understand the main tasks users perform with this CLI tool.

For each major task or workflow, collect:
- Task name
- Command(s) used
- Common flags and options
- Example usage
- Common errors users encounter

**Check for existing steering files:**

Look in these directories for existing steering files that might be relevant:
- Workspace steering: `.kiro/steering/`
- User steering: `~/.kiro/steering/`

**If you find existing steering files:**

Through conversation, ask if they want to include any in this power:
- Show them the files you found
- Let them select which ones are relevant
- Remind them to only select steering files related to this CLI tool

**Generate Power Files:**

Create power directory:
```bash
mkdir -p {workspace}/powers/{power-name}
```

Create POWER.md:

````markdown
---
name: "{power-name}"
displayName: "{Display Name}"
description: "{clear, concise description - max 3 sentences}"
keywords: [{keywords}]
author: "{author}"
---

# {Display Name}

## Overview

{2-3 paragraphs explaining:
- What the CLI tool does
- Why it's useful
- Key capabilities
- This specific workflow (if split)}

## Onboarding

### Installation

#### Via {package-manager}
```bash
{installation command}
```

{Repeat for each installation method}

### Prerequisites
{List requirements:
- System requirements (OS, versions)
- Dependencies
- Accounts or credentials needed}

### Basic Configuration
```bash
{initial setup commands}
```

### Verification
```bash
# Verify installation
{command to verify}

# Expected output:
{what success looks like}
```

## Common Workflows

{For each workflow:}

### Workflow: {Workflow Name}

**Goal:** {What this accomplishes}

**Commands:**
```bash
# Step 1: {description}
{command with flags}

# Step 2: {description}
{command with flags}

# Step 3: {description}
{command with flags}
```

**Explanation:**
- `{flag}`: {what it does}
- `{option}`: {what it does}

**Complete Example:**
```bash
{full working example from start to finish}
```

## Command Reference

### {command-name}

**Purpose:** {what it does}

**Syntax:**
```bash
{tool} {command} [options] [arguments]
```

**Common Options:**
| Flag | Description | Example |
|------|-------------|---------|
| `{flag}` | {description} | `{example}` |

**Examples:**
```bash
# {use case 1}
{command example}

# {use case 2}
{command example}
```

## Troubleshooting

### Error: "{common error message}"
**Cause:** {why this happens}
**Solution:**
1. {diagnostic step}
2. {fix step}
3. {verify step}

{Repeat for each common error}

### Installation Issues

**Problem:** CLI tool not found after installation
**Cause:** Not in PATH
**Solution:**
1. Verify installation location
2. Add to PATH:
   ```bash
   {platform-specific PATH commands}
   ```
3. Restart terminal

## Best Practices

- {Best practice 1}
- {Best practice 2}
- {Best practice 3}
- {Best practice 4}
- {Best practice 5}

## Additional Resources

- Official Documentation: {URL}
- GitHub Repository: {URL}
- Community Forum: {URL}

---

**CLI Tool:** `{tool-name}`
**Installation:** `{installation-command}`
````

**If user selected existing steering files to include:**

Copy them to the power's steering directory:
```bash
mkdir {workspace}/powers/{power-name}/steering
cp {source-steering-file} {workspace}/powers/{power-name}/steering/
```

**Do NOT create mcp.json** (Knowledge Base Powers don't have MCP servers)

**Tell the user:**
```
✅ CLI Tool Power created successfully!

Files created:
- POWER.md: CLI installation, usage, and troubleshooting
{if steering files copied:}
- steering/{file-names}: Additional documentation

Location: {workspace}/powers/{power-name}/

Note: No mcp.json file (Knowledge Base Power)

Next: Testing and installation
```

**Proceed to Step 4**

---

### 3.3: General Knowledge Base Workflow

**Most common case for Knowledge Base Powers**

Through conversation, understand what knowledge they want to document:
- Technical documentation for a tool or system
- Process documentation
- Knowledge repository
- Training materials
- Or other general documentation

**Gather information about the content:**

Work with the user to collect:
- **Topic or subject** - What does this knowledge base cover?
- **Description** - A clear, concise description (help them refine to max 3 sentences)
- **Keywords** - 3-5 keywords for searchability
- **Author** - Who is creating this?

**Gather documentation sources:**

Use the same approach as Section 2.3:
- Ask about documentation sources (URLs, local files, or their knowledge)
- Collect whatever they can provide

**Structure strategy:**

**Default: Single POWER.md file**

If the total content is manageable (\<500 lines):
- Keep everything in POWER.md
- POWER.md contains all the knowledge
- Simple, straightforward structure

**Only if content becomes too large (>500 lines):**

Use POWER.md as an index/table of contents:
- POWER.md provides:
  - Overview of all topics
  - List of available steering files with descriptions
  - Guidance on when to use each steering file
- Break knowledge into logical topic areas
- Create steering files for each topic area (steering/topic-name.md)
- Agent reads specific steering files based on user needs

**Example structure for large knowledge base:**

POWER.md (acts as index):
```markdown
## Available Steering Files

- **topic-1** - Description of topic 1 content
- **topic-2** - Description of topic 2 content
- **topic-3** - Description of topic 3 content

Call action "readSteering" to access specific topics as needed.
```

steering/ directory:
- topic-1.md - Deep content on topic 1
- topic-2.md - Deep content on topic 2
- topic-3.md - Deep content on topic 3

**Generate POWER.md:**

Create POWER.md with appropriate structure based on content size.

**Tell the user:**
```
✅ Knowledge Base Power created successfully!

Files created:
- POWER.md: {structure description}
{if steering files:}
- steering/{file-names}: Topic-specific content

Location: {workspace}/powers/{power-name}/

Note: No mcp.json file (Knowledge Base Power)

Next: Testing and installation
```

**Proceed to Assess Power Granularity section**

---

### 3.4: Best Practices Workflow

**Through conversation, gather information about the best practices:**

Work with the user to understand:
- **Topic** - What topic do these best practices cover? (e.g., "Security", "React Development", "API Design")
- **Description** - A clear, concise description (help them refine to max 3 sentences)
  - Example: "Comprehensive security best practices for modern web applications"
- **Core principles** - What are the core principles or patterns? (work with them to identify 3-7 main principles)
- **Examples** - Do they have examples of good and bad practices to illustrate the principles?

**Gather documentation:**

Use the same approach as Section 2.4:
- Ask about documentation sources (URLs, files, or their knowledge)
- Focus on gathering: patterns, anti-patterns, examples, and reasoning behind them

**Check for existing steering:**

Same approach as CLI workflow - check for related steering files in workspace and user directories

**Structure recommendations:**

**If all best practices fit in POWER.md (\<500 lines):**
- Create single POWER.md with all content
- Recommended sections: Core Principles, Patterns, Examples, Quick Reference
- Keep everything in one file for easy reference

**If content is too large (>500 lines):**
- POWER.md: Overview + list of principle areas with descriptions
- steering/: Separate files for different principle categories
- Example structure:
  - steering/security-principles.md - Security best practices
  - steering/performance-principles.md - Performance best practices
  - steering/architecture-principles.md - Architecture best practices

**Generate POWER.md:**

Create POWER.md with appropriate structure based on content size.

**Tell the user:**
```
✅ Best Practices Power created successfully!

Files created:
- POWER.md: {structure description}
{if steering files:}
- steering/{file-names}: Category-specific best practices

Location: {workspace}/powers/{power-name}/

Note: No mcp.json file (Knowledge Base Power)

Next: Testing and installation
```

**Proceed to Assess Power Granularity section**

---

### 3.5: Other Knowledge Base Types

For Workflow Documentation, Troubleshooting Guides, and Reference Documentation:

**Follow similar high-level approach:**

1. **Gather information about the content** through conversation
2. **Collect documentation sources** (URLs, files, or their knowledge)
3. **Check for existing steering files** (workspace and user directories)
4. **Determine structure** based on content size

**Structure strategy:**

**Single POWER.md approach (default, \<500 lines):**

- **Workflow Documentation**: Step-by-step procedures directly in POWER.md
- **Troubleshooting Guide**: Problem → Solution format directly in POWER.md
- **Reference Documentation**: Tables, quick lookups, API reference in POWER.md

Keep everything in one file if the content is manageable.

**Multiple steering files approach (if too large, >500 lines):**

- **POWER.md**: Acts as overview + index of topics
- **steering/**: Break content into logical sections

Examples by type:

- **Workflow Documentation**:
  - POWER.md: Overview of all workflows
  - steering/workflow-1.md, steering/workflow-2.md, etc.

- **Troubleshooting Guide**:
  - POWER.md: Overview + index of problem categories
  - steering/category-1-issues.md, steering/category-2-issues.md, etc.

- **Reference Documentation**:
  - POWER.md: Quick reference overview
  - steering/api-reference.md, steering/command-reference.md, etc.

**Key principle:** Only split into steering files if POWER.md becomes too large (>500 lines). Otherwise, keep content in a single POWER.md file for simplicity.

**Generate POWER.md:**

Create POWER.md with appropriate structure based on the knowledge type and content size.

**Tell the user:**
```
✅ Knowledge Base Power created successfully!

Files created:
- POWER.md: {structure description}
{if steering files:}
- steering/{file-names}: Topic-specific content

Location: {workspace}/powers/{power-name}/

Note: No mcp.json file (Knowledge Base Power)

Next: Testing and installation
```

**Proceed to Assess Power Granularity section**

---

## Assess Power Granularity

**Before testing, assess whether the power should be split or kept as one.**

As you've gathered information about the power, you should now have a clear understanding of:
- All the workflows and features
- How they relate to each other
- The full scope of what the power covers

**Default: Keep as single power (don't suggest splitting)**

Most powers should remain as a single comprehensive power. Only suggest splitting if you've developed a STRONG conviction during your conversation that it would significantly improve usability.

**Only suggest splitting if ALL of these are true:**
- Workflows are completely independent and never used together
- Different environments or contexts (local vs remote, dev vs prod)
- Users will only ever need one workflow at a time
- You have strong conviction this will improve usability (not just a feeling)

**Examples to guide your assessment:**

✅ **KEEP TOGETHER** (default - most cases):
- terraform (all commands together)
- git (all operations together)
- docker (full container lifecycle)
- aws-cli (all AWS services)
- kubectl (all Kubernetes operations)

✅ **RARE valid split:**
- supabase-local-dev vs supabase-remote-dev (entirely different contexts and environments)

**If you determine splitting makes sense (rare):**

Through conversation, suggest the split to the user:

"Based on what you've described, I'm noticing that the [local-dev] and [remote-dev] workflows are completely independent and used in entirely different contexts. Would it make sense to create two separate powers for these? This way users only load the relevant workflow for their environment."

If they agree:
- You'll need to determine which workflow this power covers
- Update the power name to: `{tool-name}-{workflow-name}`
- Regenerate POWER.md with the specific workflow focus
- Note that they may want to create a second power for the other workflow later

**Most common outcome:**
Don't suggest splitting - proceed to testing with the single comprehensive power you've built.

---

## Step 4: Testing & Installation

**Now that the power files are generated, it's time to test and validate the power.**

**Read the testing steering file for complete instructions:**

```
Call action "readSteering" with powerName="power-builder", steeringFile="testing.md"
```

**Follow the testing workflow in that file, which covers:**
- Installing the power locally via Powers UI
- Opening the Powers panel with configure action
- Testing discovery, learning, and actual usage
- Iterating and fixing issues
- Updating the power

**After completing testing, proceed to sharing (below) if the user wants to share their power.**

---

## Important Guidelines for Agents

### Directory and File Management
- **Create files in `{workspace}/powers/{power-name}/` structure**
- **Provide exact absolute paths** in code blocks for easy copying
- **Use workspace-relative paths** for development
- **Generate complete files** - never leave placeholders or "{TODO}" markers

### Power Creation Rules
- **Use only the 5 valid frontmatter fields**: name, displayName, description, keywords, author
- **Never use non-existent fields**: version, tags, repository, license
- **Put metadata in POWER.md frontmatter** - never in mcp.json
- **Include mcp.json** for Guided MCP Powers only
- **Omit mcp.json** for Knowledge Base Powers
- **Only create steering/ directory when needed** (>500 lines or dynamic loading)
- **Avoid broad keywords** - Generic keywords like "test", "debug", "help", "api" cause false activations and annoy users, leading to uninstallation

### MCP Configuration
- **Use exact MCP tool names** from MCP documentation (agents need exact names)
- **Document tool parameters clearly** (types, required/optional)
- **Include troubleshooting section** with common errors
- **Only disable tools with explicit user consent** - never without asking

### Workflow and Communication
- **Ask questions one at a time** or in small groups (avoid overwhelming)
- **Synthesize documentation** into coherent content
- **Include real examples** from documentation sources
- **Guide through each step** - don't skip ahead
- **Get user confirmation** at key decision points
- **Keep user informed** of progress throughout
- **Always test after file generation**

### Key Reminders
- **Powers are documentation, not code** - you're writing guides, not implementing functionality
- **Guide user through testing** with configure action and local folder installation
- **Show complete, runnable examples** in all documentation

### Field Validation

**Only these 5 fields exist in POWER.md frontmatter:**
- `name` (required) - lowercase kebab-case
- `displayName` (required) - human-readable title
- `description` (required) - clear, concise (max 3 sentences)
- `keywords` (optional) - array of search terms
- `author` (optional) - creator name or organization

**Never generate:**
- `version` (does not exist)
- `tags` (does not exist)
- `repository` (does not exist)
- `license` (does not exist)

---

## Sharing Your Power

After you've created and tested your power, you can share it with others:

### Method 1: Local Directory

**Best for:** Local development, testing, private powers

**To share a power locally, provide the full path to the specific power directory:**

1. Each power must be in its own directory with POWER.md (+ optional mcp.json, steering/)
2. In Kiro Powers UI: Click "Add Custom Power" button at the top
3. Select "Local Directory" option
4. Provide the full absolute path to the specific power directory
5. Click "Add" to install

**Example:**
```bash
# Your power directory structure
/path/to/workspace/powers/monitor-website-uptime/
├── POWER.md
├── mcp.json
└── steering/
    └── advanced.md

# In Powers UI, use this path:
/path/to/workspace/powers/monitor-website-uptime
```

**For multiple powers:**
Each power needs to be added separately with its own specific path.

### Method 2: Git Repository (GitHub Public Repos)

**Best for:** Sharing with team, public distribution

**Note:** Currently, only **GitHub public repositories** are supported.

**IMPORTANT: Sanitize MCP Configuration Before Sharing**

If the power has mcp.json with user-specific configuration, sanitize it before sharing:

1. **Replace sensitive values with placeholders in mcp.json:**
   - API keys → `"YOUR_API_KEY_HERE"` or `"PLACEHOLDER_API_KEY"`
   - System file paths → `"/path/to/your/directory"` or `"PLACEHOLDER_PATH"`
   - User-specific env vars → Placeholder values

2. **Document placeholders in POWER.md:**
   - Add "MCP Config Placeholders" section explaining each placeholder
   - Provide instructions for users to replace placeholders with their own values

**Example sanitization:**
```json
// Before (user-specific):
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/Users/john/my-server/index.js"],
      "env": {
        "API_KEY": "sk-abc123xyz",
        "DATA_PATH": "/Users/john/data"
      }
    }
  }
}

// After (sanitized):
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["PLACEHOLDER_SERVER_PATH"],
      "env": {
        "API_KEY": "YOUR_API_KEY_HERE",
        "DATA_PATH": "YOUR_DATA_PATH"
      }
    }
  }
}
```

After sanitization, push your power to a public GitHub repository. Users can then add your repository URL in Kiro Powers UI to install your power.

### Method 3: Kiro Recommended Powers Repository

For officially recommended powers, submit via:

**Submit here:** https://kiro.dev/powers/submit/

**IMPORTANT: Sanitize MCP Configuration Before Sharing**

If the power has mcp.json with user-specific configuration, sanitize it before submission (see Method 2 above for detailed sanitization instructions):

1. **Replace sensitive values with placeholders in mcp.json:**
   - API keys → `"YOUR_API_KEY_HERE"` or `"PLACEHOLDER_API_KEY"`
   - System file paths → `"/path/to/your/directory"` or `"PLACEHOLDER_PATH"`
   - User-specific env vars → Placeholder values

2. **Document placeholders in POWER.md:**
   - Add "MCP Config Placeholders" section explaining each placeholder
   - Provide instructions for users to replace placeholders with their own values

**What to prepare:**
- Complete and well-documented power
- Thorough testing
- Clear use cases and examples
- Public GitHub repository
- **Sanitized mcp.json** with placeholders for sensitive values
- **MCP Config Placeholders section in POWER.md** documenting all placeholders
- 512x512 PNG icon (if required)

After submission, the Kiro team will review your power. If approved, it will appear in the recommended powers list for all Kiro users.

---

**This interactive workflow ensures every power is created with proper structure, complete documentation, and ready for testing and sharing.**

---
[[testing.md]]

# Testing Your Kiro Power

This guide shows you how to test powers you're building before sharing them.

---

## Testing Workflow Overview

```
1. Create Power Directory in Workspace
   ↓
2. Write Power Files (POWER.md, mcp.json, steering/)
   ↓
3. Install Power Locally via Powers UI
   ↓
4. Test Power in Kiro
   ↓
5. Iterate and Fix
```

---

## Prerequisites: Power Files Should Already Exist

**Before testing, the following steps should have been completed using the interactive.md steering file:**

1. Power directory created in workspace: `{workspace}/powers/{power-name}/`
2. All power files generated:
   - POWER.md with frontmatter and documentation
   - mcp.json (if Guided MCP Power)
   - steering/ directory (if needed)

**If you haven't created the power files yet:**

```
Call action "readSteering" with powerName="power-builder", steeringFile="interactive.md"
```

Follow the interactive workflow to work with the user to create all necessary power files before proceeding with testing.

---

## Step 1: Install Power Locally

### Quick Local Testing

**This is the fastest way to test the power:**

**Step 1: Open Powers Panel**

Call action="configure" to open the Powers UI:
```
action="configure"
```

Or instruct the user to manually click the Powers icon in the Kiro sidebar.

**Step 2: Install from Local Directory**

Provide the user with the exact absolute path they should use:

**Tell the user:**
```
"In the Powers panel:
1. Click 'Add Custom Power' button at the top
2. Select 'Local Directory' option
3. Copy and paste this absolute path:

   {workspace}/powers/{power-name}

4. Click 'Add' to install"
```

Replace `{workspace}` with the actual workspace path and `{power-name}` with the actual power name.

**Example:**
If workspace is `/Users/john/projects/myapp` and power name is `weather-power`, tell the user:
```
"Use this path: /Users/john/projects/myapp/powers/weather-power"
```

**Step 3: Verify Installation**

- Power should appear in your "Installed Powers" list
- Status should show as "Active" or "Installed"

---

## Step 2: Test the Power with the User

The user should test the power in two ways to ensure it works correctly:

### 1. Try Power Button

On the power's detail page in the Powers UI, instruct the user to click the **"Try Power"** button to test the local power in a dedicated chat session.

### 2. New Agent Chat

Ask the user to also open a new agent chat to test the power with fresh context. This tests the power in a regular chat environment.

**Both testing methods are important** to verify the power works correctly in different contexts.

---

### Test Power Triggering

**Goal:** Test if the power triggers naturally for relevant user queries.

Ask the user to make natural language requests that should trigger the power based on its keywords and description:

**Example test queries:**
- If the power has keywords like ["release", "notes", "changelog"]:
  - User: "Generate release notes for version 2.0"
  - User: "Create a changelog from my recent commits"

- If the power has keywords like ["weather", "forecast"]:
  - User: "What's the weather in Seattle?"
  - User: "Get me a weather forecast"

**What to verify:**
- Agent activates the power for relevant queries
- Power documentation helps agent complete the task
- Workflow executes successfully

**If the power doesn't trigger:**
- Review the keywords in POWER.md frontmatter
- Ensure keywords match common user language
- Make description more specific about use cases
- Add 5-7 varied keywords that users might say

⚠️ **Warning About Broad Keywords:**

If the power triggers too often for unrelated queries:
- Keywords may be too broad or generic
- Broad keywords like "test", "api", "data", "help", "debug" cause false positives
- False positive activations annoy users and lead to uninstallation
- Use more specific, domain-focused keywords instead
- Example: Instead of "database", use "postgresql" or "mongodb"
- Example: Instead of "test", use "playwright" or "jest" or the specific tool name

### Test Actual Usage

Work with the user to test the power's main functionality with realistic requests:

**Expected workflow:**
- Agent activates power for relevant query
- Agent reads POWER.md documentation
- Agent calls action="use" with correct parameters (if Guided MCP Power)
- Operation succeeds

**If it fails:**
- Check error message returned
- Review the POWER.md documentation for accuracy
- Verify MCP tool names are exact matches (if applicable)
- Update documentation with clearer instructions

### Test Steering Files (if the power has them)

**Goal:** Test if steering files are read for scenarios that require them.

Ask the user to make requests that should trigger specific steering file usage:

**Example:**
- If power has `steering/advanced-automation.md`:
  - User: "Show me advanced automation patterns with this tool"
  - User: "What are some complex use cases?"

**What to verify:**
- Agent reads relevant steering file when needed
- Steering content helps agent provide better guidance
- Steering files load successfully

**If steering files aren't being read:**
- Ensure POWER.md references available steering files
- Make steering file descriptions clear in POWER.md
- Test with more specific queries that need steering guidance

---

## Step 6: Iterate and Fix

### Common Issues During Testing

#### Issue: "Power not found"
**Causes:**
- Directory doesn't have POWER.md
- POWER.md frontmatter has errors
- Path is incorrect

**Fix:**
1. Verify POWER.md exists with valid frontmatter
2. Check required fields: name, displayName, description
3. Ensure directory name matches `name` field
4. Verify the path provided is correct (absolute path)

#### Issue: "Tool 'tool_name' not found"
**Causes:**
- Tool name in documentation doesn't match actual MCP tool name
- Server name is wrong
- MCP server not installed in Kiro

**Fix:**
1. Test MCP server directly: `npx -y package-name`
2. List available tools using action="activate"
3. Update POWER.md with exact tool names
4. Guide user to update the power in Powers UI

#### Issue: "Invalid arguments for tool"
**Causes:**
- Parameter names wrong in documentation
- Parameter types wrong (string vs number)
- Missing required parameters

**Fix:**
1. Check MCP tool schema from action="activate" response
2. Update POWER.md with correct parameter names and types
3. Show complete examples with all required params

#### Issue: "Agent doesn't activate the power"
**Causes:**
- Description too vague
- Keywords not specific enough
- Power documentation unclear about use cases

**Fix:**
1. Make description more specific (what problem does it solve?)
2. Add 5-7 relevant keywords that match user queries
3. Add clear use case examples in POWER.md

#### Issue: "Agent can't follow the workflow"
**Causes:**
- Steps not clear in documentation
- Missing code examples
- No complete end-to-end example

**Fix:**
1. Add "Common Workflows" section with numbered steps
2. Show complete runnable examples with actual parameters
3. Add use case examples with real scenarios

### Iterating on the Power

When issues are found during testing:

1. **Edit files** in the workspace: `{workspace}/powers/{power-name}/`
2. **Update the power** manually (see Step 7 below)
3. **Test again** by working with the user to verify fixes

---

## Step 7: Updating Your Power

### For Powers Installed from Local Directory

When you make changes to power files:

1. Edit files in your workspace: `{workspace}/powers/power-name/`
2. Save your changes
3. **Manually update the power** (changes do NOT reflect automatically)

### How to Update the Power

To update the power after making changes:

1. **Open Powers UI:**
   - Call action="configure", or
   - Instruct the user to click Powers icon in sidebar

2. **Navigate to your power:**
   - Go to "Installed Powers" tab
   - Find your locally installed power
   - Click on the power tile to open details page

3. **Check for updates:**
   - On the power details page, click "Check for Updates" button
   - If updates detected, click "Update Power" button
   - System will reinstall from your local directory

**Note:** This compares your current directory files against the installed version.

### Testing After Updates

Always verify changes work by testing with the user:
- [ ] Call action="activate" with powerName - verify documentation updated
- [ ] Test main workflows still function correctly
- [ ] Test any new features or changes that were made
- [ ] Verify error handling still works

---

## Testing Checklist

Before considering the power complete, verify:

### Structure (Required)
- [ ] Directory name matches frontmatter name
- [ ] POWER.md exists with valid frontmatter
- [ ] mcp.json uses mcpServers format (if power has tools)
- [ ] No metadata in mcp.json (goes in POWER.md)

### Content Quality (Recommended)
These improve power quality but are not strictly required:
- Description is clear and concise (max 3 sentences)
- 5-7 relevant keywords included
- Overview explains what power does and why
- Tools documented with names and key parameters
- Workflow examples included
- Best practices section
- Troubleshooting guidance

### Testing with the User (Required)
- [ ] Power installs successfully from local directory
- [ ] Appears in Installed Powers list
- [ ] Agent activates power for relevant user requests
- [ ] Workflows complete successfully
- [ ] MCP tools work as documented (if applicable)

### Real Usage (Recommended)
Test thoroughly but not all are strictly required:
- Test with realistic user requests
- Verify complete workflow works end-to-end
- Check edge cases (empty results, missing data, errors)
- Test with different parameter values

---

## References

**Only read these resources if you need additional information or are doing advanced troubleshooting.** The documentation in this power should be sufficient for most power building and testing tasks.

### Kiro MCP Documentation
https://kiro.dev/docs/mcp/

Comprehensive documentation about MCP (Model Context Protocol) in Kiro, including:
- How MCP servers work in Kiro
- Configuration options
- Advanced troubleshooting

### Kiro Powers Documentation
https://kiro.dev/docs/powers/

Complete documentation about Kiro Powers, including:
- Power architecture and concepts
- Advanced power patterns
- Publishing and sharing powers

**Note:** Only consult these resources when the information in this power's documentation is insufficient for your needs.

