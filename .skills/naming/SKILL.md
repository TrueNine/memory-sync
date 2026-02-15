---
name: naming
description: Project/module/product naming conventions following JetBrains and Adobe style. Activate when creating projects, modules, or product names.
displayName: Naming
keywords:
  - naming
  - project
  - module
  - product
  - jetbrains
  - adobe
  - brand
  - identifier
author: TrueNine
version: 2025.12.29
---
# Naming

Project, module, and product naming directly impacts recognisability and brand consistency. This spec references JetBrains and Adobe naming philosophies.

## Core Constraints (Primacy)

**Mandatory Rules**:

- **All lowercase**
- **kebab-case** (hyphen-separated)

**Three Naming Principles**:

1. **Readability** — Instantly understandable
2. **Memorability** — Short, punchy, easy to recall
3. **Extensibility** — Supports product line expansion

**Prohibited**:

| Forbidden                     | Reason            |
| :---------------------------- | :---------------- |
| Uppercase letters             | Enforce lowercase |
| Underscore `_`                | Use `-` instead   |
| camelCase                     | Use kebab-case    |
| Pure numbers or number prefix | Not intuitive     |
| More than 3 words             | Too long          |
| Vague abbreviations           | e.g. `mgr`, `svc` |

---

## JetBrains Style

JetBrains naming pattern: **Word combination + Metaphor**

| Pattern           | Example                      | Description                     |
| :---------------- | :--------------------------- | :------------------------------ |
| Domain + Metaphor | intellij                     | Intelligence + Java             |
| Animal/Nature     | pycharm, goland, clion       | Python charm, Go land, C lion   |
| Function literal  | webstorm, datagrip, rubymine | Web storm, Data grip, Ruby mine |
| Verb/Noun         | fleet, rider, aqua           | Fleet, Rider, Water             |

---

## Adobe Style

Adobe naming pattern: **Brand prefix + Function word + Mnemonic**

| Pattern           | Example                      | Description                        |
| :---------------- | :--------------------------- | :--------------------------------- |
| Brand + Function  | adobe-photoshop              | Brand unity                        |
| Function + Suffix | premiere-pro, acrobat-reader | Pro/Reader for version distinction |
| Product family    | photoshop, photoshop-camera  | Main product + derivative          |

### Mnemonics

For icons and quick identifiers, 2-3 lowercase letters:

```
ps = photoshop
ai = illustrator
pr = premiere-pro
ae = after-effects
psc = photoshop-camera
```

---

## Practice Guide

### Project Naming

| Scenario           | Example                         |
| :----------------- | :------------------------------ |
| Open source        | `my-awesome-lib`                |
| Commercial product | `data-sync`, `cloud-bridge`     |
| Internal tool      | `deploy-helper`, `log-viewer`   |
| Microservice       | `user-service`, `order-service` |

### Module Naming

| Type           | Name                      |
| :------------- | :------------------------ |
| Core           | `core`, `kernel`          |
| Interface      | `api`, `interface`        |
| Implementation | `impl`, `internal`        |
| Utility        | `support`, `ext`, `addon` |
| Configuration  | `config`, `settings`      |

### Version Suffix

| Suffix | Meaning            | Example          |
| :----- | :----------------- | :--------------- |
| pro    | Professional       | `premiere-pro`   |
| lite   | Lightweight        | `data-sync-lite` |
| ce     | Community Edition  | `intellij-ce`    |
| ee     | Enterprise Edition | `weblogic-ee`    |

---

## Validation Checklist (Recency)

After naming **MUST** verify:

1. All lowercase
2. Uses kebab-case
3. Short (≤3 words)
4. Easy to read and remember
5. Supports product line extension
6. Mnemonic is unique and intuitive
7. No conflict with existing products