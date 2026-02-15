Memory Prompt context hierarchy.

**Hierarchy Structure**

```
app/global.cn.mdx              # Global: highest priority
app/project/src/
├── agt.cn.mdx              # Root: project-wide
├── api/
│  ├── agt.cn.mdx          # Child L1: API layer
│  └── controllers/
│    └── agt.cn.mdx      # Child L2: Controllers
└── core/
  └── agt.cn.mdx          # Child L1: Core business
```

**Priority Rules**

Global > Root > Child (deeper = lower priority but more specialised)

**Inheritance Rules**

- Child prompt inherits parent context
- Child describes only current-level responsibility; do not repeat parent
- Lower priority refines and extends higher; must not contradict

**Conflict Avoidance**

```toon
examples[2]:
 - type: bad
  description: Direct contradiction
  content: |
    Root: use camelCase
    Child: use snake_case
 - type: warning
  description: Exception must be stated
  content: |
    Root: REST API
    Child: This module uses GraphQL (exception: integration with third-party)
```
