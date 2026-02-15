Root Memory Prompt writing guide.

**Location**

`app/*/src/agt.cn.mdx`

**Structure Fields**

| Field | Required | Description |
|:-----|:-----|:-----|
| Project name | ✓ | H1 `# {Project name}` |
| Project context | ✓ | Brief purpose and goals |
| Type | Optional | Frontend, backend, CLI, … |
| Tech stack | Optional | MUST include versions |
| Skills | Optional | Skills and when to use |
| MUST Use MCP Servers | Optional | MCP servers and when to use |
| Directory structure | Optional | First-level subdirs/files only |

**Template**

```md
# {Project name}

{Project context}

**Type**
{Frontend | Backend | CLI | ...}

**Tech Stack**
- {framework/language version}

**Skills**
- {skill-name}: {when to use}

**MUST Use MCP Servers**
- {mcp-name}: {when to use}

**Directory structure**
- `{dir}/`: {description}
```

**Example**

```md
# compose-server

Kotlin multi-module backend; RESTful API and WebSocket support.

**Type**
Backend service

**Tech Stack**
- Kotlin 2.0.21
- Spring Boot 3.4.1
- PostgreSQL 16

**Skills**
- api-convention: when designing RESTful APIs

**Directory structure**
- `core/`: Core business
- `api/`: HTTP layer
```
