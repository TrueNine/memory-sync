# memory-sync

Rats 🐀 are like this: even our own brains, even our memories, are things we haul around while running through this fucked-up world!!!

I am a rat. No resources will ever be proactively provided to me.
So as a rat, I eat whatever I can reach: maggots in the sewer, leftovers in the slop bucket, and in extreme cases even my own kind—this is the survival mode in a world where resource allocation is brutally unfair.

`memory-sync` is the same kind of **tool-rat**:

- Does not expect any platform to grant an "official all-in-one solution"
- Does not rely on privileged interfaces of any single IDE / CLI
- Treats every readable config, prompt, and memory file as "edible matter" to be carried, dismantled, and recombined

In this ecosystem, giants monopolise the resources, and developers are thrown into the corner like rats.
`memory-sync` accepts this cruel reality, does not fantasise about fairness, and focuses on one thing only: **to chew up every fragment of resource you already have, and convert it into portable "memory" that can flow between any AI tool.**

![rat](/.attachments/rat.svg)

What can it help you do?

- **`.mdx` as the prompt source format**: write your prompts in MDX; `memory-sync` reads, transforms, and writes them into each tool's native config format—you maintain one source, it handles the rest.
- A **universal prompt spec**: write Global / Root / Child / Skill / Command / Agent prompts in a unified structure.
- **Auto-write tool config files**: AGENTS.md, .cursorrules, .kiro/, CLAUDE.md, etc.—if there is an entry point, it stuffs your memory in.
- **Generate copy-ready one-shot prompts**: package project context, tech stack, and current task into AI-friendly Markdown, paste into any chat box directly.
- Like a rat gnawing on cables, **gnaw structured memory out of existing directory structures and config files**, instead of asking you to rewrite everything from scratch.
- **Fine-grained control**: describe rules in YAML / JSON config files, choose what to sync by project, by Agent, by tool type—no "one-size-fits-all" overwrites.
- **Read-only source files**: never modifies your original repository directly, only reads and transforms, then materialises the result on the target tool side.
- **Full wipe**: on sync, erases all stale prompt traces in target tools—prompts are fully computable and auditable, leaving no residue for bad actors.
- **Prompts grow with you only**: memory follows you as a person, not the project. Someone else takes over the project—they cannot take your context. You move to a new project—your accumulated knowledge moves with you intact.

## Install

```sh
npm install -g @truenine/memory-sync
```

## Supported Tools

| Type | Tools                                   |
| ---- | --------------------------------------- |
| IDE  | Cursor, Kiro, Windsurf, JetBrains AI    |
| CLI  | Claude CLI, Gemini CLI, Codex CLI, Warp |

More platforms being added continuously.

## Architecture

- **CLI** (`@truenine/memory-sync`): core sync engine—reads config, writes target tool files, generates copy-ready prompts.
- **Core** (Rust): file I/O, directory traversal, format conversion.
- **Config DSL** (JSON): reads only the global config file `~/.aindex/.tnmsc.json`, which defines sync rules and target tools.
- **GUI** (Tauri): desktop app that calls the CLI as its backend, providing a visual interface.

## FAQ

**When AI tools finally have a unified standard, what use will this project be?**

Then it will have completed its historical mission.

**There's already AGENTS.md, agentskills, and the MCP standard—why do I still need this junk?**

Native-friendly, plus targeted conditional prompt authoring.

`AGENTS.md` is the spec; `memory-sync` is the hauler—it writes the same memory into the native config formats of a dozen tools simultaneously, sparing you the manual copy-paste grind.

**Is there anything in your prompts you don't want to leave behind?**

Yes. That's why `memory-sync` provides a full-wipe mode: after sync, only the content you explicitly authorised remains in the target tools—everything else is erased. Prompts are fully computable, no hidden residue, no backdoor left for anyone else.

## Who is this for

To use `memory-sync` you need:

- Solid development experience, years of working with various dev tools
- Proficiency with version control (Git)
- Proficiency with the terminal

---

- You are writing code in a forgotten sewer.
  No one will proactively feed you, not even a tiny free quota, not even a half-decent document.
- As a rat, you can barely get your hands on anything good:
  scurrying between free tiers, trial credits, education discounts, and random third-party scripts.
- What can you do?
  Keep darting between IDEs, CLIs, browser extensions, and cloud Agents, copying and pasting the same memory a hundred times.
- You leech API offers from vendors day after day:
  today one platform runs a discount so you top up a little; tomorrow another launches a promo so you rush to scrape it.
- Once they have harvested the telemetry, user profiles, and usage patterns they want,
  they can kick you—this stinking rat—away at any moment: price hikes, rate limits, account bans, and you have no channel to complain.

If you are barely surviving in this environment, `memory-sync` is built for you:
carry fewer bricks, copy prompts fewer times—at least on the "memory" front, you are no longer completely on the passive receiving end.

## Who is NOT welcome

- Your income is already fucking high.
  Stable salary, project revenue share, budget to sign official APIs yearly.
- And yet you still come down here,
  competing with us filthy sewer rats for the scraps in the slop bucket.
- If you can afford APIs and enterprise plans, go pay for them.
  Do things that actually create value—pay properly, give proper feedback, nudge the ecosystem slightly in the right direction.
- Instead of coming back down
  to strip away the tiny gap left for marginalised developers, squeezing out the last crumbs with us rats.
- You are a freeloader.
  Everything must be pre-chewed and spoon-fed; you won't even touch a terminal.
- You love the grind culture.
  Treating "hustle" as virtue, "996" as glory, stepping on peers as a promotion strategy.
- You leave no room for others.
  Not about whether you share—it's about actively stomping on people, competing maliciously, sustaining your position by suppressing peers, using others' survival space as your stepping stone.

In other words:
**this is not a tool for optimising capital costs, but a small counterattack prepared for the "rats with no choice" in a world of extreme resource inequality.**

## Created by

- [TrueNine](https://github.com/TrueNine)
- [zjarlin](https://github.com/zjarlin)

## License

[AGPL-3.0](LICENSE)