---
name: obsidian
description: Obsidian knowledge base collaboration standards. Activate when editing knowledge cards, retrieving materials, or using special syntax.
displayName: Obsidian Collaboration
keywords:
  - obsidian
  - markdown
  - knowledge-base
  - wiki
  - note
  - link
  - timeline
  - tabs
author: TrueNine
version: 1.0.0
---
## Core Constraints (Primacy)

Obsidian knowledge base collaboration standards. **Consult on demand**:

| Scenario                    | Document     | Link                          |
| :-------------------------- | :----------- | :---------------------------- |
| Edit/create knowledge cards | editing.md   | [editing.md](editing.md)     |
| Retrieve materials          | retrieval.md | [retrieval.md](retrieval.md) |
| Timeline syntax             | timeline.md  | [timeline.md](timeline.md)   |
| Tabs syntax                 | tabs.md      | [tabs.md](tabs.md)           |

## Quick Reference

### Link Syntax

- Internal link: `[[path|alias]]`, path relative to vault root
- Attachment embed: `![[path]]`, MUST occupy standalone line
- **PROHIBIT** wrapping links in backticks

### Knowledge Card Structure

1. YAML Front Matter (optional, AI MUST NOT edit)
2. Abstract: one-sentence core concept
3. External links (official site, repo, docs)
4. Body: start from H2

### Editing Prohibitions

- PROHIBIT adding H1 headings
- PROHIBIT adding `**bold**` syntax
- PROHIBIT "related cards" section at end

## Validation Checklist (Recency)

After editing **MUST** verify:

1. Link target file exists
2. No backtick-wrapped links
3. Attachment embeds on standalone lines
4. Existing Front Matter unchanged