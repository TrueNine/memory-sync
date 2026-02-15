# Reference

## Official Resources

| Resource | Link |
|:-----|:-----|
| Full LLM docs | https://payloadcms.com/llms-full.txt |
| Docs | https://payloadcms.com/docs |
| GitHub | https://github.com/payloadcms/payload |
| Templates | https://github.com/payloadcms/payload/tree/main/templates |

## Doc Navigation

| Topic | Path |
|:-----|:-----|
| Config | /configuration/overview |
| Collections | /configuration/collections |
| Globals | /configuration/globals |
| Fields | /fields/overview |
| Local API | /local-api/overview |
| Access | /access-control/overview |
| Hooks | /hooks/overview |
| Custom components | /custom-components/overview |
| Versions & drafts | /versions/overview |
| Auth | /authentication/overview |
| Upload | /upload/overview |
| Plugins | /plugins/overview |
| TypeScript | /typescript/overview |
| Production | /production/overview |

## Package Versions (Payload 3.x)

All Payload packages use matching versions; current: `3.74.x`

### Core

```json
{
  "payload": "^3.74.0",
  "@payloadcms/next": "^3.74.0"
}
```

### DB Adapters

```json
{
  "@payloadcms/db-mongodb": "^3.74.0",
  "@payloadcms/db-postgres": "^3.74.0",
  "@payloadcms/db-sqlite": "^3.74.0"
}
```

### Rich Text

```json
{
  "@payloadcms/richtext-lexical": "^3.74.0",
  "@payloadcms/richtext-slate": "^3.74.0"
}
```

### UI

```json
{
  "@payloadcms/ui": "^3.74.0"
}
```

### Common Plugins

```json
{
  "@payloadcms/plugin-cloud": "^3.74.0",
  "@payloadcms/plugin-form-builder": "^3.74.0",
  "@payloadcms/plugin-nested-docs": "^3.74.0",
  "@payloadcms/plugin-redirects": "^3.74.0",
  "@payloadcms/plugin-search": "^3.74.0",
  "@payloadcms/plugin-seo": "^3.74.0"
}
```

## Installation

### New Project

```bash
pnpm create payload-app@latest my-project

# Templates: blank | website | ecommerce
```

### Existing Next.js

```bash
pnpm add payload @payloadcms/next

# One DB adapter
pnpm add @payloadcms/db-mongodb
# or @payloadcms/db-postgres
# or @payloadcms/db-sqlite

# One rich text
pnpm add @payloadcms/richtext-lexical
# or @payloadcms/richtext-slate
```

## Environment

```bash
# .env
PAYLOAD_SECRET=your-secret-key-here
DATABASE_URL=mongodb://localhost:27017/payload
# or postgresql://... or file:./payload.db

NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

## CLI

```bash
pnpm payload generate:types
pnpm payload generate:importmap
pnpm payload migrate
pnpm payload migrate:create
pnpm payload migrate:status
pnpm payload create-first-user
pnpm payload --help
```

## Project-Specific

In `wuzhiyuan` workspace:
- See `AGENTS.md` for project rules
- See `.cursor/rules/` for context files

## Community

| Resource | Link |
|:-----|:-----|
| Discord | https://discord.com/invite/payload |
| YouTube | https://www.youtube.com/@payloadcms |
| Twitter | https://twitter.com/payloadcms |
| Blog | https://payloadcms.com/blog |

## Learning Path

1. **Start** — [Getting Started](https://payloadcms.com/docs/getting-started/what-is-payload)
2. **Config** — [Configuration](https://payloadcms.com/docs/configuration/overview)
3. **Collections** — [Collections](https://payloadcms.com/docs/configuration/collections)
4. **Local API** — [Local API](https://payloadcms.com/docs/local-api/overview)
5. **Access** — [Access Control](https://payloadcms.com/docs/access-control/overview)
6. **Hooks** — [Hooks](https://payloadcms.com/docs/hooks/overview)
7. **Deploy** — [Production](https://payloadcms.com/docs/production/overview)

## FAQ

### Which DB?

- **MongoDB** — Flexible schema, fast iteration
- **PostgreSQL** — Relational, strong typing, performance
- **SQLite** — Simple, no server, small projects

### Which Rich Text?

- **Lexical** — Modern, recommended
- **Slate** — Stable, mature

### Deployment?

- **Vercel** — Recommended
- **Netlify** — Supported
- **Self-host** — Node server

### File Upload?

- **Local** — `upload.staticDir`
- **Cloud** — Plugins (S3, Cloudinary, etc.)

### Multilingual?

- Use `localization` config
- [Localization docs](https://payloadcms.com/docs/configuration/localization)
