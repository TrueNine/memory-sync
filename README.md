# croessweave

<p align="center">
  <img src="doc/app/icon.svg" alt="croessweave icon" width="256">
</p>

A rat carries even its own memories when moving. `croessweave` is that kind of tool-rat: expecting no platform charity, relying on no single IDE's privileged interface — it搬运-fetches, disassembles, and reassembles every config, prompt, and memory file it can read.

## What It Does

- Treat `.mdx` / `.src.mdx` as the single source of truth; generate native configs and managed artifacts for each tool from one source
- Unified input asset model: Memory, Skills, Skill categories, Commands, Sub-agents, Rules, README, etc.
- Auto-write configs for each tool: AGENTS.md, Claude Code, Codex CLI, Cursor, Windsurf, Qoder, Trae, Warp, JetBrains AI, etc.
- Manage derived artifacts: prompt outputs, skills exports organized as `skills/<skill-category>/<skill>/`, README-class outputs
- Multiple entry points: `tnmsc` CLI, private SDK, MCP stdio server, Tauri GUI
- Obsidian integration: TNMSOP opens `.mdx` as native Markdown and safely previews static prompt syntax
- Fine-grained write-scope control (`outputScopes`, `cleanupProtection`)
- Source and derivations are auditable — no silent source mutations, no hidden residuals
- Memories follow the person, not the project — no leakage
## Install

```sh
npm install -g @truenine/croessweave-cli
```

MCP server:

```sh
npm install -g @truenine/croessweave-mcp
```

### TNMSOP for Obsidian

TNMSOP is maintained in the [`croessweave-obsidian-plugin/`](croessweave-obsidian-plugin/README.md) submodule. Install it from the Obsidian community directory or download `main.js`, `manifest.json`, and `styles.css` from the matching [TNMSOP Release](https://github.com/TrueNine/croessweave-obsidian-plugin/releases). BRAT users should install `TrueNine/croessweave-obsidian-plugin`.

TNMSOP shares the croessweave CalVer version. The plugin is released first with the exact plain `<version>` tag, then croessweave pins that release through the submodule and publishes its `v<version>` system release.

## Supported Tools

| Type | Tools |
| --- | --- |
| IDE / Editor | Cursor, Windsurf, Qoder, Trae, Trae CN, JetBrains AI, Zed, VS Code |
| CLI | Claude Code, Codex CLI, Gemini CLI, Droid CLI, Opencode, Warp |
| Other outputs | AGENTS.md, categorized Skills, README, `.editorconfig`, `.git/info/exclude` |

## Architecture

- **SDK** (`tnmsd` crate / `@truenine/croessweave-sdk`): private mixed core
- **CLI** (`tnmsc` / `@truenine/croessweave-cli`): public command entry
- **MCP** (`tnmsm` / `@truenine/croessweave-mcp`): stdio server
- **GUI** (Tauri): desktop entry
## FAQ

**If AI tools adopt a unified standard, is this project still needed?** Then it has fulfilled its historical mission.

**We already have AGENTS.md and MCP standards — why still need this?** Native targets differ; conditional prompts still need concrete landing points. `AGENTS.md` is a spec; `croessweave` is the porter and assembler.

**Are there things in prompts you don't want to leave behind?** Yes. Hence the cleanup and protection boundaries.

## Who It's For

You need dev experience, Git fluency, and terminal comfort.

If you're scraping by in a world of profoundly unequal resources — free tiers, trial quotas, third-party scripts — `croessweave` is for you.

## Who It's Not For

- Those with stable income and corporate budgets who still grab marginal developers' free resources
- Entitlement seekers who want everything handed to them
- Those who glorify overwork as virtue
- Malicious competitors stepping on others to climb
**This is not a tool for capital to optimise costs — it's a rat's small act of defiance in a world of resource injustice.**

## Created by

- [TrueNine](https://github.com/TrueNine)
- [zjarlin](https://github.com/zjarlin)
## License

[AGPL-3.0](LICENSE)
