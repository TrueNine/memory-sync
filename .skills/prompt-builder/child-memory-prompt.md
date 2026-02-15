Child Memory Prompt writing guide.

**Location**

`app/*/src/**/agt.cn.mdx` (non-root)

**Structure Fields**

| Field | Required | Description |
|:-----|:-----|:-----|
| Module context | ✓ | Direct opening, no H1 |
| Type | Optional | API layer, DB layer, library, … |
| Skills | Optional | Skills to use and when |
| MUST Use MCP Servers | Optional | MCP servers and when to use |
| Directory structure | Optional | First-level subdirs/files only |

Note: Child does not need `# {name}` H1; start with module context.

**Template**

```md
{Module context}

**Type**
{API layer | DB layer | library | ...}

**Skills**
- {skill-name}: {when to use}

**Directory structure**
- `{dir}/`: {description}
```

**Example**

```md
HTTP layer: request routing and response serialisation.

**Type**
API layer (Spring WebFlux 6.2)

**Skills**
- api-convention: API design rules

**Directory structure**
- `controllers/`: Controllers
- `dto/`: Data transfer objects
```
