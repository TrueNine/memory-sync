# Self-Optimize

This document is for continuous improvement of skill-builder itself. Read this document for optimization directions and references when skill-builder needs improvement.

Optimization material comes from three external platforms' Skill creation practices:

- [examples/example_codex_skill_creator.md](examples/example_codex_skill_creator.md): Codex platform
- [examples/example_cursor_create_skill.md](examples/example_cursor_create_skill.md): Cursor Skill
- [examples/example_cursor_create_subagent.md](examples/example_cursor_create_subagent.md): Cursor Subagent

---

## Optimization Dimensions

### 1. Context Budget Awareness ✅ v1

Landed:
- skill.cn.mdx core constraints added Context Budget awareness item
- skill.cn.mdx added main file ≤500 lines limit
- create.cn.mdx Core Philosophy added "Key premise" paragraph
- create.cn.mdx Writing Principles added "Concise Over Verbose" principle

To deepen:
- Set token cap for description (currently only char limit)

### 2. Degrees of Freedom ✅ v1

Landed:
- skill.cn.mdx core constraints added Degrees of Freedom table (High/Medium/Low)

To deepen:
- Add complete examples for each freedom level in create.cn.mdx

### 3. Description Trigger Quality ✅ v1

Landed:
- skill.cn.mdx core constraints description requirement changed to "WHAT + WHEN, third person"
- create.cn.mdx Description is the Soul section added third person requirement + counter-examples
- Validation checklists (skill/modify) aligned

To deepen:
- None

### 4. Progressive Disclosure Patterns ✅ v1

Landed:
- create.cn.mdx added Progressive Disclosure Patterns section (Pattern A/B/C)

To deepen:
- Add decision flowchart for choosing the appropriate Pattern

### 5. Anti-Patterns ✅ v1

Landed:
- skill.cn.mdx core constraints added Anti-Patterns list
- create.cn.mdx added Anti-Patterns table (with Example + Fix)
- modify.cn.mdx added Check Anti-Patterns scenario
- Validation checklists (skill/modify) added Anti-Patterns check item

To deepen:
- None

### 6. Bundled Resources Convention

Codex has explicit categorisation for `scripts/`, `references/`, `assets/`; skill-builder currently only has `examples/`.

Potential improvements:
- Consider whether skill-builder needs a standard resource directory taxonomy
- Clarify that `examples/` is for learning reference, not copy-paste templates

### 7. Creation Workflow Phases ✅ v1

Landed:
- create.cn.mdx added Creation Workflow section (Discovery → Design → Implementation → Verification, four phases)

To deepen:
- Add automated verification methods in the Verification phase

---

## Optimization Principles

Follow these when optimising:

1. **Only add what's valuable** — don't optimise for the sake of it; every change must have clear benefit
2. **Maintain backward compatibility** — don't break existing Skill structures and conventions
3. **Small before large** — prioritise patching gaps in existing content before adding new sections
4. **Reference but don't copy** — the three examples come from different platforms; adapt to skill-builder's own `.cn.mdx` system
