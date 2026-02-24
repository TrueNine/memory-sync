# Security Policy

## Supported Versions

Only the latest release receives security fixes. No backport patches for older versions.

| Version | Supported |
|---------|-----------|
| Latest | ✅ |
| Older | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability, **do not** report it in a public Issue.

Contact the maintainer privately via:

- GitHub Security Advisory: submit a private report under the repository's **Security** tab
- Email: contact [@TrueNine](https://github.com/TrueNine) directly

Please include:

- Vulnerability description and impact scope
- Reproduction steps (minimal example)
- Your OS, Node.js version, and `memory-sync` version
- Suggested fix if any

## Response Timeline

The maintainer is a person, not a security team. No SLA, no 24-hour response guarantee.

- Will acknowledge receipt as soon as possible
- Will release a patch within a reasonable timeframe after confirmation
- Will publicly disclose vulnerability details after the fix is released

Don't rush.

## Scope

`memory-sync` is a CLI tool that **reads source files only and writes target configs only**. Its security boundary:

- **Reads**: user `.cn.mdx` source files, project config files (`.tnmsc.json`)
- **Writes**: target tool config directories (`.cursor/`, `.claude/`, `.kiro/`, etc.)
- **Cleans**: removes stale files from target directories during sync

The following are **out of scope**:

- Security vulnerabilities in target AI tools themselves
- Compliance of user prompt content
- Supply chain security of third-party plugins (`packages/`) — all plugins are `private` and not published to npm

## Design Principles

- **Never modifies source files**: read-only on source; writes only to target
- **Full clean mode**: after sync, only explicitly authorised content remains in target directories — no hidden residue
- **No network requests**: CLI core makes no outbound network requests (version check excepted, and times out gracefully)
- **No telemetry**: no user data collected or reported

## License

This project is licensed under [AGPL-3.0](LICENSE). Unauthorised commercial use in violation of the licence will be pursued legally.
