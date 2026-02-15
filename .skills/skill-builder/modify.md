# Modify Skill

## Modification Principles

Follow these when modifying existing Skills:

1. **Read full context first** — understand existing structure and intent
2. **Proactively fix errors and fill gaps** — fix issues on sight
3. **Only add what's valuable** — no redundancy, no repetition
4. **Check Anti-Patterns** — clean up existing anti-patterns while modifying

---

## Common Modification Scenarios

### Add Sub-Document

When the main file becomes bloated:

1. Identify content blocks that can stand alone
2. Create sub-document (no Front Matter needed)
3. Add link in main file's `## On-Demand Loading`

```mdx
## On-Demand Loading

- **New scenario** [new-topic.md](new-topic.md): brief description
```

### Update Trigger Conditions

When modifying description, ensure:
- Functionality description preserved
- Trigger timing updated
- Kept within 100 chars

### Adjust Keywords

When adding/removing keywords:
- Keep 5–7
- Specific, not broad
- Avoid conflicts with other Skills

### Check Anti-Patterns

While modifying, also check and clean up:
- Too many options without a default recommendation?
- Time-sensitive information present?
- Consistent terminology throughout?
- Trigger conditions mistakenly written in body?

### Maintain QA Document

When encountering new issues:
1. Add new entry in `qa.cn.mdx`
2. Use next sequential number (`# #3`, `# #4`...)
3. Add warning link at relevant location in main file

---

## Validation Checklist (Recency)

Check after modifying a Skill:

- [ ] `description` contains WHAT + WHEN, third person
- [ ] `name` matches directory name, kebab-case
- [ ] Char count ≤12,000 (Chinese ≤6,000); main file ≤500 lines
- [ ] Core constraints at top
- [ ] Sub-document links use `.md` suffix
- [ ] No nested directories (one-level allowed)
- [ ] Consistent terminology throughout, no mixing
- [ ] No Anti-Patterns
- [ ] New content does not conflict with existing content
- [ ] QA numbering sequential and correctly formatted
