# Editing Standards

- PROHIBIT adding H1 headings; filename serves as main title
- Keep existing YAML Front Matter fields unchanged, followed by blank line
- PROHIBIT adding YAML Front Matter to new files
- PROHIBIT placeholder comments or "to be added" markers (except templates)
- Confirm target file exists before adding links
- Use unified `[[path|alias]]` syntax, path relative to vault root
- Strictly PROHIBIT backtick-wrapped links: PROHIBIT `` `[[path|alias]]` ``
- `![[path]]` attachment embeds MUST occupy standalone line
- PROHIBIT `**bold**` syntax; convey info through structure and headings

## Knowledge Card Structure

Standard structure order:

1. YAML Front Matter (optional, AI MUST NOT edit)
2. Blank line
3. Abstract: one-sentence core concept
4. Blank line
5. External links (official site, repo, docs)
6. Blank line
7. Body: start from H2

```toon
examples[2]:
 - type: good
   description: Standard card structure
   content: |
     `markdown

     Rust is a systems programming language focusing on safety, concurrency, and performance.

     - Official: https://www.rust-lang.org
     - GitHub: https://github.com/rust-lang/rust

     ## Core Features

     - Ownership system guarantees memory safety
     `
 - type: bad
   description: Backtick-wrapped link
   content: |
     `markdown

     `[[softwares/Obsidian|Obsidian]]` is a knowledge management tool.
     `
   summary: Links wrapped in backticks cannot be parsed.
```

## Content Principles

- Focus on indexing function, avoid excessive exposition
- Reference related concepts via links
- Abstract states core point in one sentence
- External links MUST be directly relevant
- PROHIBIT "related cards" or "references" sections at end; associations expressed via inline links in Abstract
