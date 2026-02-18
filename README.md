# memory-sync

Rats 🐀 are like this: even our own brains, even our memories, are things we haul around while running through this fucked-up world!!!

I am a rat. No resources will ever be proactively provided to me.\
So as a rat, I eat whatever I can reach: maggots in the sewer, leftovers in the slop bucket, and in extreme cases even my own kind—this is the survival mode in a world where resource allocation is brutally unfair.

`memory-sync` is the same kind of **tool-rat**:

- Does not expect any platform to grant an "official all-in-one solution"
- Does not rely on privileged interfaces of any single IDE / CLI
- Treats every readable config, prompt, and memory file as "edible matter" to be carried, dismantled, and recombined

In this ecosystem, giants monopolise the resources, and developers are thrown into the corner like rats.\
`memory-sync` accepts this cruel reality, does not fantasise about fairness, and focuses on one thing only: **to chew up every fragment of resource you already have, and convert it into portable "memory" that can flow between any AI tool.**

![rat](/.attachments/rat.svg)

What can it help you do?

- A **universal prompt specification**: teaches you how to write Global / Root / Child / Skill / Command / Agent prompts in a unified structure.
- **Sync these prompts into as many AI coding tools as possible**: Cursor, Kiro, Warp, Claude CLI, Gemini CLI, Codex CLI, and more—if there is an entry point, it will stuff your memory into it.
- Like a rat gnawing on cables, it **gnaws structured memory out of existing directory structures and config files**, instead of asking you to rewrite everything from scratch.
- Provides **fine-grained control**: you can choose what to sync by project, by Agent, by tool type, avoiding "one-size-fits-all" overwrites.
- Guarantees **read-only source files**: it never modifies your original repository directly, only reads and transforms, then materialises the result on the target tool side.

## Who is this for

- You are writing code in a forgotten sewer.\
  No one will proactively feed you, not even with a tiny free quota, not even with a half-decent document.
- As a rat, you can barely get your hands on anything good:\
  you can only scurry between free tiers, trial credits, education discounts, and random third-party scripts.
- What can you do?\
  You keep darting between IDEs, CLIs, browser extensions, and cloud Agents, copying and pasting the same memory a hundred times.
- You leech API offers from vendors day after day:\
  today one platform runs a discount so you top up a little; tomorrow another launches a promo so you rush to scrape it.
- Once they have harvested the telemetry, user profiles, and usage patterns they want,\
  they can kick you—this stinking rat—away at any moment: price hikes, rate limits, account bans, leaving you with no channel to complain.

If you are barely surviving in this environment, `memory-sync` is built for you:\
it helps you carry fewer bricks, copy prompts fewer times, and at least on the "memory" front, you are no longer completely on the passive receiving end.

## Who is NOT welcome

- Your income is already fucking high.\
  You have a stable salary, project revenue share, and a budget to sign official APIs yearly.
- And yet you still come down here,\
  competing with us filthy sewer rats for the scraps in the slop bucket.
- If you can afford APIs and enterprise plans, then pay for them.\
  Go and do things that actually create more value—like paying properly and giving proper feedback, nudging the ecosystem slightly in the right direction.
- Instead of turning back,\
  stripping away the tiny gap that was originally left for marginalised developers, and squeezing out the last crumbs with us.

In other words:\
**this is not a tool for optimising capital costs, but a small counterattack prepared for the "rats with no choice" in a world of extreme resource inequality.**

## Created by

- [TrueNine](https://github.com/TrueNine)
- [zjarlin](https://github.com/zjarlin)

## License

[AGPL-3.0](LICENSE)

# memory-sync

Cross-AI programming tool prompt synchronization tool. One rule set, multi-platform adaptation.

## Quick Start

### Prerequisites

Node.js >= 25.2.1, pnpm >= 10

### Installation

```bash
pnpm add -g @truenine/memory-sync
```

Or use directly:

```bash
npx @truenine/memory-sync
```

### Run

```bash
tnmsc
```

### Update

```bash
pnpm update -g @truenine/memory-sync --latest
```

## GUI Desktop App

GUI package provides Tauri desktop application, build in `gui/` directory:

```bash
pnpm tauri:build
```

## Created by

- [TrueNine](https://github.com/TrueNine)
- [zjarlin](https://github.com/zjarlin)

## License

[AGPL-3.0](LICENSE)