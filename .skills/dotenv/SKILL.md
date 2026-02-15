---
name: dotenv
description: Environment variable configuration standards with dotenv as de facto standard. Activate when creating .env files, configuring secrets, or managing multi-environment variables.
displayName: Dotenv Environment Variables
keywords:
  - dotenv
  - env
  - environment
  - config
  - secret
  - variable
  - configuration
author: TrueNine
version: 2026.01.02
---
## Core Constraints (Primacy)

1. **Format Standard**: `KEY=value`, one per line, variable names uppercase with underscores
2. **Security Redline**: All `.env*` files except `.env.example` MUST NOT be committed to Git
3. **Template Required**: Project MUST include `.env.example` as configuration template
4. **Variable Alignment**: All `.env*` files MUST align with `.env.example`, which MUST contain comments for all variables
5. **Root Directory Only**: All `.env*` files MUST be in project root, NEVER in subdirectories
6. **Two-Level Naming**: Only `.env.{mode}` format allowed, `.env.dev.local` etc. PROHIBITED

---

## AI Operation Rules

- **Read Allowed**: Can read `.env*` files except `.env.example`
- **Workaround**: If IDE tools lack permission, use shell tools directly
- **Check Command**: `grep -o '^[A-Z_]*=' .env | cut -d= -f1`

---

## File Naming Convention

| File                            | Purpose         | Git Commit |
| :------------------------------ | :-------------- | :--------- |
| `.env`                          | Main config     | ❌          |
| `.env.local`                    | Local override  | ❌          |
| `.env.example`                  | Config template | ✅          |
| `.env.development` / `.env.dev` | Development env | ❌          |
| `.env.production` / `.env.prod` | Production env  | ❌          |
| `.env.test`                     | Test env        | ❌          |

---

## Writing Standards

```bash
# Comments start with #
DATABASE_URL=postgresql://localhost:5432/mydb
API_KEY=your_api_key_here

# Values with spaces need quotes
APP_NAME="My Application"

# Multi-line values use quotes
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
```

---

## Variable Naming Groups

Use prefixes for grouping:

| Prefix            | Purpose         |
| :---------------- | :-------------- |
| `DB_`             | Database config |
| `REDIS_`          | Redis config    |
| `SMTP_` / `MAIL_` | Email config    |
| `OSS_` / `S3_`    | Object storage  |
| `AUTH_`           | Authentication  |

For monorepo, add module prefix: `MODULE_A_DB_HOST`, `MODULE_B_DB_HOST`

---

## Value Type Convention

| Type          | Convention                              |
| :------------ | :-------------------------------------- |
| Boolean       | `true` / `false`, NEVER `1` / `0`       |
| Empty         | Omit variable, NEVER `KEY=` or `KEY=""` |
| Special chars | Escape with `\`, e.g. `\#`, `\$`, `\"`  |

---

## .env.example Template Standards

```bash
# Database
DATABASE_URL=postgresql://localhost:5432/dev_db

# API Keys
API_KEY=dev_api_key_here
SECRET_KEY=dev_secret_key_here

# Optional
DEBUG=true
LOG_LEVEL=debug
```

- Only dev/test level example values, NEVER production configs
- Use placeholders like `dev_xxx_here` for sensitive values
- Add group comments
- Provide reasonable dev environment defaults

---

## Prohibited Variable Prefixes

Framework-specific prefixes **PROHIBITED**, harmful for multi-system collaboration:

| Prefix         | Framework        |
| :------------- | :--------------- |
| `NEXT_PUBLIC_` | Next.js          |
| `VITE_`        | Vite             |
| `REACT_APP_`   | Create React App |
| `VUE_APP_`     | Vue CLI          |
| `NUXT_PUBLIC_` | Nuxt             |
| `EXPO_PUBLIC_` | Expo             |

Use generic naming, let build tools or adapters handle prefix mapping.

---

## Verification Checklist (Recency)

- [ ] `.gitignore` excludes all `.env*` files (except `.env.example`)
- [ ] `.env.example` template exists
- [ ] Variable names uppercase with underscores
- [ ] No sensitive info hardcoded in source
- [ ] No three-level naming (e.g. `.env.dev.local`)
- [ ] No framework-specific prefixes (e.g. `NEXT_PUBLIC_`, `VITE_`)
- [ ] All variables have comments in `.env.example`
- [ ] All `.env*` files only in project root