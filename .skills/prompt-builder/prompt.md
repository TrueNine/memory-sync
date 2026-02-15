Prompt engineering core techniques.

**Zero-Shot vs Few-Shot**

- Zero-Shot: Task only, no examples; good for open-ended questions
- Few-Shot: Examples guide output; good for fixed-format outputs

**Token Budget**

Single memory prompt ≤12,000 characters (Chinese ≤6,000); use the lowest platform limit.

**Format Priority**

TOON > YAML > Markdown > XML/JSON

```toon
examples[2]:
 - type: good
  description: TOON is clear
  content: |
    examples[1]:
     - type: good
      code: fn process() { }
 - type: bad
  description: XML verbose
  content: |
    <examples>
     <good-example>
      <code>fn process() { }</code>
     </good-example>
    </examples>
```

**Primacy–Recency**

Put core task and key constraints at the start; put validation at the end.

```toon
examples[1]:
 - type: good
  description: Clear structure
  content: |
    # PRIMARY: Implement auth, strict security
    [... rules ...]
    # CRITICAL: Never store passwords in plain text
```

**Conciseness**

Avoid redundant self-description; get to the point.

```toon
examples[2]:
 - type: bad
  description: Redundant opening
  content: |
    This file is the AI Agent guide for project-name frontend development.
    ## Tech stack
 - type: good
  description: Concise opening
  content: |
    # Frontend development guide
    ## Tech stack
```

**Iterative Optimization**

```
Draft -> Test -> Meets expectation? -> Yes -> Done
        ↓ No
        Fix -> Test
```
