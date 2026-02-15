Directory structure conventions for memory prompts.

**Basic Format**

Indented list + Markdown links + short description.

```toon
examples[2]:
 - type: good
  description: Nested structure
  content: |
    - [src/](/src/): AI Agent source
     - [locale/](/src/locale/): locale
     - [commands/](/src/commands/): commands
 - type: bad
  description: Flat list
  content: |
    - [src/](/src/): AI Agent source
    - [src/locale/](/src/locale/): locale
    - [src/commands/](/src/commands/): commands
```

**Template Structure**

Placeholders and globs in backticks; real paths as links.

```toon
examples[1]:
 - type: good
  description: Mix links and backticks
  content: |
    - [gradle/](/gradle/): Gradle config
    - `{module}/`: Other modules
     - `src/`: Source
```

**Path Rules**

| Rule | Correct | Wrong |
|:-----|:-----|:-----|
| `()` = repo root | `(/src/)` | `(src/)` |
| Dir ends with `/` | `[locale/]` | `[locale]` |
| `[]` = current level only | `[locale/]` | `[src/locale/]` |
| No filesystem paths | `(/src/)` | `(/home/user/src/)` |
| Spaces as `%20` | `(/my%20dir/)` | `(/my dir/)` |

**Ref Path Rules**

In files under `app/<project>/src/`, reference structure from the target project’s perspective.

```toon
examples[2]:
 - type: good
  description: Target project view
  content: "[shared/](/shared/)"
 - type: bad
  description: Exposes internal path
  content: "[shared/](/app/compose-server/.code/shared/)"
```
