# memory-sync

A rat is like this. Even its own brain, even its memory, has to be carried around in this rotten world!!!

I am a rat. No resource is going to walk up and offer itself to me.
So as a rat, I eat whatever I can reach: maggots in the sewer, leftovers in a slop bucket, and in extreme cases even my own kind. That is what survival looks like in a world where resource distribution is brutally unequal.

`memory-sync` is the same kind of **tool-rat**:

- It does not wait for any platform to hand out an "official all-in-one solution"
- It does not rely on the privileged interface of any single IDE or CLI
- Any configuration, prompt, memory file, or generated artifact it can read becomes something edible: something to haul away, break apart, and recombine
In this ecosystem, the giants hoard the resources while developers get thrown into a corner like rats.
`memory-sync` accepts this cruel reality, does not fantasize about fairness, and focuses on one thing only: **to chew through every fragment of resource you already have and turn it into portable "memory" that can flow between AI tools.**

![rat](/.attachments/rat.svg)

What can it do for you?

- **Use `.mdx` / `.src.mdx` as the source of truth**: you maintain one source, and `memory-sync` turns it into native tool configs plus managed generated artifacts.
- **Use one unified input-asset model**: Global / Workspace / Project Memory, Skills, Commands, Sub-agents, Rules, README-like outputs, and related assets all fit into one structure.
- **Auto-write native tool configs**: AGENTS.md, Claude Code CLI, Codex CLI, Cursor, Windsurf, Qoder, Trae, Warp, JetBrains AI Assistant Codex, and more. If a native entry point exists, it can write there.
- **Manage derived artifacts**: besides target-tool configs, it can maintain English prompt outputs, skill exports, README-like outputs, and other helper configs.
- **Provide multiple entry points**: the public entry is the `tnmsc` CLI; internally there is also a private SDK, an MCP stdio server, and a Tauri GUI, all working around the same source-of-truth model.
- **Control write scope precisely**: use `outputScopes`, `cleanupProtection`, and related settings to constrain writes and cleanup by project, topic, and tool.
- **Keep source and derived outputs auditable**: source files, generated artifacts, and target-tool configs stay clearly separated. No hidden source edits. No hidden residue.
- **Let memory grow with you**: memory follows you as a person instead of leaking with the project. If a project changes hands, they do not get your context. If you move to another project, your accumulated memory goes with you unchanged.
## Install

```sh
npm install -g @truenine/memory-sync-cli
```

Optional MCP server:

```sh
npm install -g @truenine/memory-sync-mcp
```

## Supported Tools

| Type | Tools |
| --- | --- |
| IDE / Editor | Cursor, Windsurf, Qoder, Trae, Trae CN, JetBrains AI Assistant Codex, Zed, VS Code |
| CLI | Claude Code CLI, OpenAI Codex CLI, Gemini CLI, Droid CLI, Opencode CLI, Warp |
| Other Outputs | AGENTS.md-style outputs, Generic Skills, README-like outputs, `.editorconfig`, `.git/info/exclude` |

More platforms are still being added.

## Architecture

- **SDK** (`@truenine/memory-sync-sdk` / `tnmsc` crate): the private mixed core for pipeline, prompt service, schema, bridge runtime, and core integration logic.
- **CLI Shell** (`@truenine/memory-sync-cli`): the public `tnmsc` command entry, compatibility export surface, and platform-distribution shell.
- **MCP** (`@truenine/memory-sync-mcp`): an stdio server that exposes prompt-asset management to MCP-capable hosts.
- **Libraries** (`logger`, `md-compiler`, `script-runtime`): Rust-first shared libraries.
- **GUI** (Tauri): the desktop workflow entry, consuming the `tnmsc` crate from `sdk`.
## FAQ

**When AI tools finally have a unified standard, what use will this project be?**

Then it will have completed its historical mission.

**There's already AGENTS.md, agentskills, and the MCP standard. Why do I still need this junk?**

Because native targets still differ, and because conditional prompt authoring still has to land somewhere concrete.

`AGENTS.md` is the format. `memory-sync` is the hauler plus assembler. It writes the same source of truth into multiple native configs and managed artifacts at once, so you do not have to do the copy-paste labor by hand. CLI, SDK, MCP, and GUI are just different entry points around that same model.

**Is there anything in the prompt or generated output that I may not want to leave behind?**

Yes. That is why `memory-sync` gives you cleanup and protection boundaries. After sync, only the managed outputs you explicitly allow should remain. Anything else should either be cleaned or protected on purpose. Prompts and derived artifacts should stay computable, auditable, and residue-free.

## Who is this for

To use `memory-sync` you need:

- Solid development experience and long-term exposure to dev tools
- Competence with version control (Git)
- Competence with the terminal
---

- You are writing code in a forgotten sewer.
No one is going to proactively feed you, not even a tiny free quota, not even a decent document.
- As a rat, you were never going to get good food anyway:
you keep scurrying between free tiers, trial credits, education discounts, and random third-party scripts.
- What can you do?
Keep darting between IDEs, CLIs, browser extensions, and cloud agents, copying and pasting the same memory a hundred times.
- You keep scraping vendor API deals day after day:
today one platform discounts something, so you top up a little; tomorrow another launches a promotion, so you rush over there too.
- Once they have harvested the telemetry, user profile, and usage pattern they wanted,
they can kick you away at any moment: price hikes, quotas, bans, and no real channel for complaint.
If you are barely surviving in this environment, `memory-sync` is built for you:
to help you carry a little less brick, paste the same prompt a few fewer times, and at least stop being completely passive around "memory".

## Who is NOT welcome

- Your income is already fucking high.
Stable salary, project revenue share, budget to sign official APIs yearly.
- And yet you still come down here,
competing with us filthy sewer rats for the scraps in the slop bucket.
- If you can afford APIs and enterprise plans, go pay for them.
Do things that actually create value: pay properly, give proper feedback, and nudge the ecosystem slightly in the right direction.
- Instead of coming back down
to strip away the tiny gap left for marginalized developers, squeezing out the last crumbs with us rats.
- You are a freeloader.
Everything must be pre-chewed and spoon-fed; you will not even touch a terminal.
- You love grind culture.
Treating "hustle" as virtue, "996" as glory, stepping on peers as a promotion strategy.
- You leave no room for others.
This is not about whether you share everything. It is about actively stomping on people, competing maliciously, and treating other people's survival space as your stepping stone.
In other words:
**this is not a tool for optimizing capital cost. It is a small counterattack for the "rats with no choice" in a world of extreme resource inequality.**

## Created by

- [TrueNine](https://github.com/TrueNine)
- [zjarlin](https://github.com/zjarlin)
## License

[AGPL-3.0](LICENSE)