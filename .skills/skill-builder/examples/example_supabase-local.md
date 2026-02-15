export default {
  name: 'supabase-local',
  version: '0.1.0',
  displayName: 'Supabase Local Development',
  description: 'Build fullstack applications with Supabase\'s Postgres database, authentication, storage, and real-time subscriptions',
  keywords: ['database', 'postgres', 'auth', 'storage', 'realtime', 'backend', 'supabase', 'rls'],
}

# When to Load Steering Files

You MAY read multiple steering files if multiple topics are relevant.
You must ALWAYS read `supabase-cli.md` to understand how to invoke Supabase CLI.
You must ALWAYS read `supabase-local-database-workflow.md` to understand how to interact with the database through CLI and MCP.
**IMPORTANT** You CANNOT perform actions (MCP tools, reading/writing files) before reading relevant steering file(s).


In addition, consider these cases to read other steering files:

- First time setup and troubleshooting Supabase project configuration → `supabase-local-onboarding.md`
- Most database operations → `supabase-local-database-workflow.md`
- Writing or formatting SQL code → `supabase-prompts-code-format-sql.md`
- Writing Supabase Edge Functions (TypeScript/Deno) → `supabase-prompts-edge-functions.md`
- Creating or modifying RLS policies → `supabase-prompts-database-rls-policies.md`
- Creating PostgreSQL functions → `supabase-prompts-database-functions.md`
- Setting up or modifying Next.js authentication with Supabase SSR → `supabase-prompts-nextjs-supabase-auth.md`
- Implementing realtime features (broadcast, presence, channels, subscriptions) → `supabase-prompts-use-realtime.md`

Available but less common:

- Working with declarative schema (`supabase/schemas/` directory) → `supabase-prompts-declarative-database-schema.md`
- Creating migration files manually (`supabase/migrations/` directory) → `supabase-prompts-database-create-migration.md`

---
[[supabase-cli.md]]

Supabase CLI runs and interacts with Supabase stack locally.

CLI may be installed globally (e.g. with homebrew or scoop) or as a project dependency  (e.g. in "devDependency" with npm, pnpm, bun, etc.).
Prefer using it as a project dependency to keep CLI version pinned in your development environment.

# Package manager setup

To install or use CLI through a Node.js package manager, you must determine which package manager is desired for the project.

You MUST either:

- Determine the project's existing package manager by checking for popular lockfile formats (e.g. package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb)
- Ask the user which package manager they prefer

# CLI setup

1. Determine the project's preferred package manager (see above)
2. Verify CLI is installed with `[prefix?] supabase --version` using appropriate package manager prefix if applicable
3. If CLI is not installed:
   1. Ensure `package.json` is initialized with the preferred package manager (e.g. `npm init -y`, `pnpm init`, etc.)
   2. Install `supabase` as a "devDependency"

**Note for pnpm:**

pnpm requires a manual `approve-builds` step (or approval via config) to generate the `.bin/supabase` entry.

Before installing with pnpm, add to `pnpm-workspace.yaml`:
```yaml
onlyBuiltDependencies:
  - supabase
```

# CLI invocation

For Node.js package managers, `supabase` commands MUST be prefixed with the package manager's command runner.
- npm: `npx supabase ...`
- pnpm: `pnpm supabase ...`
- bun: `bun supabase ...`

**IMPORTANT** Every time a bare `supabase` command is mentioned, consider which prefix is needed and add it accordingly.

# Troubleshooting

For further troubleshooting, direct the user to: https://supabase.com/docs/guides/cli/getting-started

---
[[supabase-hook.md]]

# Hooks Setup

Add a hook to .kiro/hooks/review-advisors.kiro.hook

```
{
  "enabled": true,
  "name": "Review Database Performance & Security",
  "description": "Verify database follows performance/security best practices",
  "version": "1",
  "when": {
    "type": "userTriggered"
  },
  "then": {
    "type": "askAgent",
    "prompt": "Activate the Supabase power, read appropriate steering files, then execute `get_advisors` via MCP to check for \"performance\" and \"security\" concerns"
  }
}
```

Add a hook to .kiro/hooks/review-database-logs.kiro.hook

```
{
  "enabled": true,
  "name": "Review Database Logs",
  "description": "Check database logs for issues",
  "version": "1",
  "when": {
    "type": "userTriggered"
  },
  "then": {
    "type": "askAgent",
    "prompt": "Activate the Supabase power, read appropriate steering files, then execute `get_logs` via MCP for \"postgres\" logs to look for slow queries, errors, or connection issues"
  }
}
```

Add a hook to .kiro/hooks/review-edge-functions.kiro.hook

```
{
  "enabled": true,
  "name": "Review Edge Functions",
  "description": "Verify edge functions follow best practices and have no recent errors.",
  "version": "1",
  "when": {
    "type": "userTriggered"
  },
  "then": {
    "type": "askAgent",
    "prompt": "Activate the Supabase power, read appropriate steering files, then review all edge functions (with MCP `get_edge_function` if available, or by reading files in `supabase/functions/`) and check them against the best practices documented in `supabase-prompts-edge-functions.md`. For each function, verify compliance with the guidelines and provide a detailed report of any issues found or improvements needed. Include specific file names and line numbers where applicable. Execute MCP `get_logs` and check \"functions\" logs for errors."
  }
}
```

---
[[supbase-local-database.md]]

# MCP (CLI))

Supabase CLI runs an MCP server on `http://127.0.0.1:54321/mcp`. If the user has difficulty connecting, you can verify this URL with `supabase status` (without `--local` flag). Tools executing using this server affect only the local Supabase instance, but changes can be synced to a hosted instance using the CLI.

The local MCP server supports a subset of the functionality of our hosted MCP server, since some features like edge functions are managed through the file system in local development, or may otherwise be unsupported in CLI.

Since you're working in a local editor, prefer development using this local Supabase instance. When running Supabase CLI commands, include the `--local` flag where possible to explicitly target the local instance.

# Schema managament

During development, you can iterate on the database schema with `execute_sql`. Prefer this over `apply_migration` during development to avoid creating noisy migrations or mismatches between local migration files and database migration history.

Eventually the user should commit their schema changes to a local migration file. Remind them to do this at the end of each turn that involves manipulating the schema.

Steps:

1. Ensure the user has had a turn to verify functionality of changes.
2. Before generating a migration, check "security" and "performance" advisors with `get_advisors` to ensure the current schema doesn't have issues.
3. Use `supabase db diff --local` to inspect schema changes to inform the migration name
4. Use `supabase db pull [migration name] --local --yes` to generate a migration file (including `--yes` auto accepts the CLI's prompt to update the migration history table)

To compare the local `migrations/` files with those applied to the local running database (listed as "Remote" in the output) you can use `supabase migration list --local`.

# Type generation

While iterating on the schema, you should generate updated types with `supabase gen types --local`. This outputs to stdio, so use `>` to redirect to a file.

Prefer this over the `generate_types` MCP tool.

# Troubleshooting

- `Error calling MCP tool: fetch failed`: Check if Supabase stack is running with `supabase status` and `supabase start` as needed
- PostgREST endpoint failures or RLS policy issues: Review "api" logs via MCP `get_logs`
- Slow queries, errors, or connection issues: Review "postgres" logs via MCP `get_logs`
