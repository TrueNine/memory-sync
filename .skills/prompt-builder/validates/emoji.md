export default {
  name: 'emoji-validation',
  version: '2025.01.21',
  displayName: 'Emoji Validation',
  description: 'Emoji validation rules',
  keywords: ['emoji', 'validation', 'unicode', 'character'],
  author: 'TrueNine',
}

**Allowed Emojis**

| Category | Symbol | Use |
|:-----|:-----|:-----|
| Yes/No | ❌ | Wrong/forbidden |
| Yes/No | ✅ | Right/allowed |
| Yes/No | ⚠️ | Warning/attention |
| Status | 🔴 | Critical/stop |
| Status | 🟡 | Warning/pending |
| Status | 🟢 | OK/pass |
| Status | 🔵 | Info/tip |
| Status | ⚫ | Disabled/off |
| Status | ⚪ | Empty/unset |

**Usage Rules**

- MUST use only symbols from the table above
- MUST NOT use any other emojis
- Prefer yes/no (❌✅⚠️) for judgements
- Status emojis for flow state or level

**Example**

✅ Correct: use allowed symbols
```
✅ Correct example
❌ Wrong example
⚠️ Case to watch
```

❌ Wrong: unauthorised symbols
```
✔️ Correct example
❎ Wrong example
⛔ Forbidden
```

**Validation Checklist (Recency)**

1. Use only the 9 symbols in the table
2. Prefer ❌✅⚠️ for yes/no
3. No other emojis
