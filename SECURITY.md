# Security Policy

## Supported Versions

Only the latest version receives security fixes.

| Version | Supported |
|---------|-----------|
| Latest  | ✅ |
| Historical | ❌ |

## Reporting a Vulnerability

Do not report in public Issues. Contact [@TrueNine](https://github.com/TrueNine) via GitHub Security Advisory or email.

Include: vulnerability description and impact scope, reproduction steps, environment info, fix suggestion (if any).

## Response Time

Maintainers are people, not a security team — no SLA. We'll confirm as soon as possible, fix within a reasonable timeframe, and disclose publicly after the fix. Do not push for urgency.

## Scope

CLI / SDK / MCP / GUI toolchain. Security boundaries:

- **Read**: user `.src.mdx` source files, project config, global config (`~/.aindex/.tnmsc.json`), repo metadata required for sync
- **Write**: target tool config directories, managed prompt artifacts (`dist/`), generated outputs
- **Cleanup**: erase managed outputs and residuals during sync or cleanup

Out of scope: vulnerabilities in target AI tools themselves, user prompt content compliance, hardening third-party dependencies outside this repo.

## Design Principles

- Source and derivation separation — auditable and traceable
- Cleanup targets only managed outputs — no expanded deletion scope
- No hidden telemetry
- External network behavior must be explicit

## License

[AGPL-3.0](LICENSE). Commercial use violating the license will be pursued.